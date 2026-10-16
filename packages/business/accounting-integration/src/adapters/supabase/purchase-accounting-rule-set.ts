import {
  type PurchaseAccountingRuleSet,
  AccountingIntegrationFailure,
} from "../../domain";
import {
  type PurchaseAccountingRuleSetQuery,
  type PurchaseAccountingRuleSetReader,
} from "../../application";

/** Minimal service-role RPC transport used by the purchase accounting rule adapter. */
export interface PurchaseAccountingRuleSetSupabaseSource {
  /**
   * Calls a native purchase accounting rule-set RPC.
   * @param name - Authorized RPC function name.
   * @param values - Named RPC arguments.
   * @returns RPC data or its reported database error.
   */
  rpc(name: string, values: Record<string, unknown>): PromiseLike<{ data: unknown; error: { readonly message?: string; readonly code?: string } | null }>;
}

/** Supabase-backed reader of authorized active purchase accounting rules. */
export class SupabasePurchaseAccountingRuleSetReader implements PurchaseAccountingRuleSetReader {
  /**
   * @param source - Service-only RPC transport; the function enforces access and active-company scope.
   * @returns A reader for the native purchase accounting rule-set contract.
   */
  public constructor(private readonly source: PurchaseAccountingRuleSetSupabaseSource) {}

  /** {@inheritDoc PurchaseAccountingRuleSetReader.readActive} */
  public async readActive(query: PurchaseAccountingRuleSetQuery): Promise<PurchaseAccountingRuleSet> {
    let result: { data: unknown; error: { readonly message?: string; readonly code?: string } | null };
    try {
      result = await this.source.rpc("get_native_purchase_accounting_rule_set", {
        p_actor_id: query.actorId,
        p_organization_id: query.organizationId,
        p_company_id: query.companyId,
      });
    } catch (cause) {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Purchase accounting rule source is unavailable.", { cause });
    }
    if (result.error) throw mapRpcFailure(result.error);
    return decode(result.data);
  }
}

function decode(value: unknown): PurchaseAccountingRuleSet {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Purchase accounting rules RPC returned malformed evidence.");
  }
  const row = value as Record<string, unknown>;
  if (row.source !== "purchasing.invoice_confirmed" || typeof row.version !== "string" || !Array.isArray(row.rules)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Purchase accounting rules RPC returned malformed evidence.");
  }
  return { source: "purchasing.invoice_confirmed", version: row.version, rules: row.rules.map((rule) => decodeRule(rule)) };
}

function decodeRule(value: unknown): PurchaseAccountingRuleSet["rules"][number] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULE_INVALID", "Purchase accounting rules RPC returned a malformed mapping.");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" || typeof row.version !== "string" ||
    typeof row.debitAccountId !== "string" || typeof row.creditAccountId !== "string" ||
    row.amountField !== "recognized_inventory_cost"
  ) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULE_INVALID", "Purchase accounting rules RPC returned a malformed mapping.");
  }
  return { id: row.id, version: row.version, amountField: row.amountField, debitAccountId: row.debitAccountId, creditAccountId: row.creditAccountId };
}

function mapRpcFailure(error: { readonly message?: string; readonly code?: string }): AccountingIntegrationFailure {
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  if (/ACCESS_DENIED|permission denied/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ACCESS_DENIED", "Purchase accounting rule access was denied.", { cause: error });
  if (/NO_ACTIVE_RULES|RULESET_NOT_FOUND|NO_RULES/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "No active purchase accounting rules exist for this company.", { cause: error });
  if (/RULESET_CHANGED/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_CHANGED", "Purchase accounting rules changed during the operation.", { cause: error });
  if (/INVALID/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Purchase accounting rule scope was rejected.", { cause: error });
  return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Purchase accounting rule source is unavailable.", { cause: error });
}
