import {
  AccountingIntegrationFailure,
  type AccountingIntegrationPlan,
  type AccountingIntegrationReversalPlan,
} from "../../domain";
import {
  type AccountingIntegrationPoster,
  type AccountingIntegrationPostingContext,
  type AccountingIntegrationPostingReceipt,
} from "../../application";

/** Minimal service-role RPC transport used by the purchase accounting posting adapter. */
export interface PurchaseAccountingPostingSupabaseSource {
  /**
   * Calls a native purchase-accounting posting RPC.
   * @param name - Authorized RPC function name.
   * @param values - Named RPC arguments.
   * @returns RPC data or its reported database error.
   */
  rpc(name: string, values: Record<string, unknown>): PromiseLike<{ data: unknown; error: { readonly message?: string; readonly code?: string } | null }>;
}

/** Supabase adapter that atomically posts only confirmed-purchase accounting plans. */
export class SupabasePurchaseAccountingPoster implements Pick<AccountingIntegrationPoster, "post" | "reverse"> {
  /**
   * @param source - Service-only RPC transport. Native functions enforce source freshness, period, and idempotency.
   * @returns A purchase-only accounting posting adapter.
   */
  public constructor(private readonly source: PurchaseAccountingPostingSupabaseSource) {}

  /** {@inheritDoc AccountingIntegrationPoster.post} */
  public async post(context: AccountingIntegrationPostingContext, plan: AccountingIntegrationPlan): Promise<AccountingIntegrationPostingReceipt> {
    if (plan.source !== "purchasing.invoice_confirmed") {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", "This adapter only posts confirmed purchase plans.");
    }
    const serializedPlan = serializePlan(plan);
    let result: { data: unknown; error: { readonly message?: string; readonly code?: string } | null };
    try {
      result = await this.source.rpc("post_native_purchase_accounting_integration", {
        p_actor_id: context.actorId,
        p_organization_id: context.organizationId,
        p_company_id: context.companyId,
        p_plan: serializedPlan,
      });
    } catch (cause) {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Purchase accounting posting is unavailable.", { cause });
    }
    if (result.error) throw mapPostingRpcFailure(result.error);
    return decodeReceipt(result.data, plan.operationKey);
  }

  /** {@inheritDoc AccountingIntegrationPoster.reverse} */
  public async reverse(context: AccountingIntegrationPostingContext, plan: AccountingIntegrationReversalPlan): Promise<AccountingIntegrationPostingReceipt> {
    if (plan.source !== "purchasing.invoice_confirmed") {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", "This adapter only reverses confirmed purchase plans.");
    }
    const serializedPlan = serializeReversalPlan(plan);
    let result: { data: unknown; error: { readonly message?: string; readonly code?: string } | null };
    try {
      result = await this.source.rpc("reverse_native_purchase_accounting_integration", {
        p_actor_id: context.actorId,
        p_organization_id: context.organizationId,
        p_company_id: context.companyId,
        p_plan: serializedPlan,
      });
    } catch (cause) {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Purchase accounting reversal is unavailable.", { cause });
    }
    if (result.error) throw mapReversalRpcFailure(result.error);
    return decodeReceipt(result.data, plan.operationKey);
  }
}

function serializePlan(plan: AccountingIntegrationPlan): Record<string, unknown> {
  return {
    operationKey: plan.operationKey,
    tenantId: plan.tenantId,
    organizationId: plan.organizationId,
    companyId: plan.companyId,
    source: plan.source,
    sourceId: plan.sourceId,
    sourceVersion: plan.sourceVersion,
    ruleSetVersion: plan.ruleSetVersion,
    effectiveDate: plan.effectiveDate,
    occurredAt: plan.occurredAt,
    description: plan.description,
    lines: plan.lines.map((line) => ({
      accountId: line.accountId,
      side: line.side,
      amount: exactVesTwoDecimals(line.amount),
      ruleId: line.ruleId,
      ruleVersion: line.ruleVersion,
    })),
  };
}

function serializeReversalPlan(plan: AccountingIntegrationReversalPlan): Record<string, unknown> {
  return {
    operationKey: plan.operationKey,
    originalOperationKey: plan.originalOperationKey,
    tenantId: plan.tenantId,
    organizationId: plan.organizationId,
    companyId: plan.companyId,
    source: plan.source,
    sourceId: plan.sourceId,
    sourceVersion: plan.sourceVersion,
    effectiveDate: plan.effectiveDate,
    occurredAt: plan.occurredAt,
    reason: plan.reason,
    lines: plan.lines.map((line) => ({
      accountId: line.accountId,
      side: line.side,
      amount: exactVesTwoDecimals(line.amount),
      ruleId: line.ruleId,
      ruleVersion: line.ruleVersion,
    })),
  };
}

function exactVesTwoDecimals(amount: AccountingIntegrationPlan["lines"][number]["amount"]): string {
  if (amount.currency.code !== "VES" || amount.currency.minorUnit !== 2) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_CURRENCY_INVALID", "Purchase posting requires VES amounts with exactly two decimal places.");
  }
  if (amount.minorAmount < 0n) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_AMOUNT_INVALID", "Purchase posting requires exact non-negative VES amounts with two decimal places.");
  const whole = amount.minorAmount / 100n;
  const fraction = (amount.minorAmount % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

function decodeReceipt(value: unknown, operationKey: string): AccountingIntegrationPostingReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Purchase accounting posting returned malformed evidence.");
  }
  const row = value as Record<string, unknown>;
  if (row.operationKey !== operationKey || typeof row.journalEntryId !== "string" || !row.journalEntryId.trim() || typeof row.replayed !== "boolean") {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Purchase accounting posting returned malformed evidence.");
  }
  return Object.freeze({ operationKey, journalEntryId: row.journalEntryId.trim(), replayed: row.replayed });
}

function mapPostingRpcFailure(error: { readonly message?: string; readonly code?: string }): AccountingIntegrationFailure {
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  if (/ACCESS_DENIED|permission denied/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ACCESS_DENIED", "Purchase accounting posting access was denied.", { cause: error });
  if (/PLAN_VALUES_UNTRUSTED/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_CHANGED", "Purchase source or its accounting rules no longer match the planned journal.", { cause: error });
  if (/FRACTIONAL_CENT/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_AMOUNT_INVALID", "Purchase inventory cost has fractions below one cent.", { cause: error });
  if (/NO_ACTIVE_RULES|RULE_INVALID/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Purchase accounting rules are missing or invalid.", { cause: error });
  if (/SOURCE_CHANGED/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_CHANGED", "Purchase source changed before its accounting integration could be posted.", { cause: error });
  if (/RULESET_CHANGED/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_CHANGED", "Purchase accounting rules changed before posting.", { cause: error });
  if (/PERIOD_CLOSED/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_PERIOD_CLOSED", "The purchase accounting period is closed.", { cause: error });
  if (/IDEMPOTENCY_CONFLICT/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_IDEMPOTENCY_CONFLICT", "A different accounting plan already exists for this purchase source.", { cause: error });
  if (/NOT_CONFIRMED|NOT_FOUND/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_NOT_CONFIRMED", "Purchase invoice is not confirmed in the requested scope.", { cause: error });
  if (/INVALID/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", "Purchase accounting posting plan was rejected.", { cause: error });
  return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Purchase accounting posting is unavailable.", { cause: error });
}

function mapReversalRpcFailure(error: { readonly message?: string; readonly code?: string }): AccountingIntegrationFailure {
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  if (/ACCESS_DENIED|permission denied/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ACCESS_DENIED", "Purchase accounting reversal access was denied.", { cause: error });
  if (/PERIOD_CLOSED/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_PERIOD_CLOSED", "The purchase accounting period is closed.", { cause: error });
  if (/POST_NOT_FOUND|ORIGINAL.*(NOT_FOUND|MISSING)|ORIGINAL_NOT_FOUND/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ORIGINAL_OPERATION_NOT_FOUND", "The original purchase accounting operation was not found.", { cause: error });
  if (/REVERSAL_PLAN_UNTRUSTED/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ORIGINAL_OPERATION_INVALID", "The reversal plan no longer matches the immutable original purchase operation.", { cause: error });
  if (/REVERSAL_CONFLICT/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REVERSAL_CONFLICT", "A conflicting reversal already exists for this purchase operation.", { cause: error });
  if (/IDEMPOTENCY_CONFLICT/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_IDEMPOTENCY_CONFLICT", "A different accounting reversal already exists for this purchase operation.", { cause: error });
  if (/SOURCE_CHANGED/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_CHANGED", "Purchase source changed before its accounting integration could be reversed.", { cause: error });
  if (/INVALID/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", "Purchase accounting reversal plan was rejected.", { cause: error });
  return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Purchase accounting reversal is unavailable.", { cause: error });
}
