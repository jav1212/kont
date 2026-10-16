import {
  type PayrollAccountingRuleSet,
  AccountingIntegrationFailure,
} from "../../domain";
import {
  type PayrollAccountingRuleSetQuery,
  type PayrollAccountingRuleSetReader,
} from "../../application";

/** Minimal service-role RPC transport used by the payroll accounting rule adapter. */
export interface PayrollAccountingRuleSetSupabaseSource {
  /**
   * Calls a native payroll accounting rule-set RPC.
   * @param name - Authorized RPC function name.
   * @param values - Named RPC arguments.
   * @returns RPC data or its reported database error.
   */
  rpc(name: string, values: Record<string, unknown>): PromiseLike<{ data: unknown; error: { readonly message?: string; readonly code?: string } | null }>;
}

/** Supabase-backed reader of authorized active payroll accounting rules. */
export class SupabasePayrollAccountingRuleSetReader implements PayrollAccountingRuleSetReader {
  /**
   * @param source - Service-only RPC transport; the function enforces access and active-company scope.
   * @returns A reader for the native payroll accounting rule-set contract.
   */
  public constructor(private readonly source: PayrollAccountingRuleSetSupabaseSource) {}

  /** {@inheritDoc PayrollAccountingRuleSetReader.readActive} */
  public async readActive(query: PayrollAccountingRuleSetQuery): Promise<PayrollAccountingRuleSet> {
    let result: { data: unknown; error: { readonly message?: string; readonly code?: string } | null };
    try {
      result = await this.source.rpc("get_native_payroll_accounting_rule_set", {
        p_actor_id: query.actorId,
        p_organization_id: query.organizationId,
        p_company_id: query.companyId,
      });
    } catch (cause) {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Payroll accounting rule source is unavailable.", { cause });
    }
    if (result.error) throw mapRpcFailure(result.error);
    return decode(result.data);
  }
}

function decode(value: unknown): PayrollAccountingRuleSet {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Payroll accounting rules RPC returned malformed evidence.");
  }
  const row = value as Record<string, unknown>;
  if (row.source !== "payroll.run_confirmed" || typeof row.version !== "string" || !Array.isArray(row.rules)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Payroll accounting rules RPC returned malformed evidence.");
  }
  return {
    source: "payroll.run_confirmed",
    version: row.version,
    rules: row.rules.map((rule) => decodeRule(rule)),
  };
}

function decodeRule(value: unknown): PayrollAccountingRuleSet["rules"][number] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULE_INVALID", "Payroll accounting rules RPC returned a malformed mapping.");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" || typeof row.version !== "string" ||
    typeof row.debitAccountId !== "string" || typeof row.creditAccountId !== "string" ||
    (row.amountField !== "gross_earnings" && row.amountField !== "employee_deductions" && row.amountField !== "employer_contributions" && row.amountField !== "net_pay")
  ) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULE_INVALID", "Payroll accounting rules RPC returned a malformed mapping.");
  }
  return { id: row.id, version: row.version, amountField: row.amountField, debitAccountId: row.debitAccountId, creditAccountId: row.creditAccountId };
}

function mapRpcFailure(error: { readonly message?: string; readonly code?: string }): AccountingIntegrationFailure {
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  if (/ACCESS_DENIED|permission denied/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ACCESS_DENIED", "Payroll accounting rule access was denied.", { cause: error });
  if (/NO_ACTIVE_RULES|RULESET_NOT_FOUND|NO_RULES/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "No active payroll accounting rules exist for this company.", { cause: error });
  if (/RULESET_CHANGED/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_CHANGED", "Payroll accounting rules changed during the operation.", { cause: error });
  if (/INVALID/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Payroll accounting rule scope was rejected.", { cause: error });
  return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Payroll accounting rule source is unavailable.", { cause: error });
}
