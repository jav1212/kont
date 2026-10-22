import {
  parsePayrollAccountingVes,
  type ConfirmedPayrollAccountingSnapshot,
  type PayrollAccountingSnapshotQuery,
  type PayrollAccountingSnapshotReader,
} from "../../application";
import { AccountingIntegrationFailure } from "../../domain";

/** Minimal RPC transport implemented by a service-role Supabase client. */
export interface PayrollAccountingSupabaseSource {
  /**
   * Calls a native payroll accounting RPC.
   * @param name - Authorized RPC name.
   * @param values - RPC arguments.
   * @returns The RPC data or an error returned by Supabase.
   */
  rpc(name: string, values: Record<string, unknown>): PromiseLike<{ data: unknown; error: { readonly message?: string; readonly code?: string } | null }>;
}

/** Supabase-backed reader for a PII-free, confirmed payroll accounting snapshot. */
export class SupabasePayrollAccountingSnapshotReader implements PayrollAccountingSnapshotReader {
  /**
   * @param source - Service-only Supabase RPC transport. The SQL function performs authorization and confirmation checks.
   * @returns A reader for the native payroll accounting snapshot contract.
   */
  public constructor(private readonly source: PayrollAccountingSupabaseSource) {}

  /** {@inheritDoc PayrollAccountingSnapshotReader.readConfirmed} */
  public async readConfirmed(query: PayrollAccountingSnapshotQuery): Promise<ConfirmedPayrollAccountingSnapshot> {
    let result: { data: unknown; error: { readonly message?: string; readonly code?: string } | null };
    try {
      result = await this.source.rpc("get_native_payroll_accounting_snapshot", {
        p_actor_id: query.actorId,
        p_organization_id: query.organizationId,
        p_company_id: query.companyId,
        p_run_id: query.payrollRunId,
      });
    } catch (cause) {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Payroll accounting source is unavailable.", { cause });
    }
    if (result.error) throw mapRpcFailure(result.error);
    return decode(result.data);
  }
}

function decode(value: unknown): ConfirmedPayrollAccountingSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", "Payroll accounting RPC returned malformed evidence.");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.tenantId !== "string" || typeof row.organizationId !== "string" ||
    typeof row.companyId !== "string" || typeof row.runId !== "string" ||
    row.sourceVersion !== 1 || typeof row.effectiveDate !== "string" ||
    typeof row.confirmedAt !== "string" || typeof row.receiptCount !== "number" || !Number.isSafeInteger(row.receiptCount) ||
    row.employerContributions !== null
  ) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", "Payroll accounting RPC returned malformed evidence.");
  }
  return Object.freeze({
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    companyId: row.companyId,
    runId: row.runId,
    sourceVersion: 1,
    effectiveDate: row.effectiveDate,
    confirmedAt: row.confirmedAt,
    receiptCount: row.receiptCount,
    grossEarnings: parsePayrollAccountingVes(row.grossEarnings, "Gross earnings"),
    employeeDeductions: parsePayrollAccountingVes(row.employeeDeductions, "Employee deductions"),
    netPay: parsePayrollAccountingVes(row.netPay, "Net pay"),
    roundingDifference: parsePayrollAccountingVes(row.roundingDifference, "Rounding difference", true),
    employerContributions: null,
  });
}

function mapRpcFailure(error: { readonly message?: string; readonly code?: string }): AccountingIntegrationFailure {
  const text = error.message ?? "Payroll accounting source is unavailable.";
  if (/ACCESS_DENIED|permission denied/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ACCESS_DENIED", "Payroll accounting source access was denied.", { cause: error });
  if (/NOT_CONFIRMED|NOT_FOUND|PAYROLL_ACCOUNTING_SNAPSHOT_NOT_CONFIRMED/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_NOT_CONFIRMED", "Payroll run is not confirmed or does not exist in the requested scope.", { cause: error });
  if (/INVALID/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", "Payroll accounting source rejected the requested scope.", { cause: error });
  return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Payroll accounting source is unavailable.", { cause: error });
}
