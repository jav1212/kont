import { currency, moneyFromDecimal, type Money } from "@kontave/monetary/domain";
import { AccountingIntegrationFailure, type PayrollRunConfirmedAccountingEvent } from "../domain";

const VES = currency("VES", 2);

/** Trusted server-side scope used to read an aggregate accounting snapshot for one payroll run. */
export interface PayrollAccountingSnapshotQuery {
  readonly actorId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly payrollRunId: string;
}

/** Aggregate, PII-free evidence emitted only for a confirmed payroll run. */
export interface ConfirmedPayrollAccountingSnapshot {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly runId: string;
  readonly sourceVersion: 1;
  readonly effectiveDate: string;
  readonly confirmedAt: string;
  readonly receiptCount: number;
  readonly grossEarnings: Money;
  readonly employeeDeductions: Money;
  readonly netPay: Money;
  /** Signed `netPay + employeeDeductions - grossEarnings`; a non-zero value requires remediation. */
  readonly roundingDifference: Money;
  /** `null` means the source does not yet calculate employer contributions. */
  readonly employerContributions: Money | null;
}

/** Read boundary owned by the accounting integration application. */
export interface PayrollAccountingSnapshotReader {
  /**
   * Returns one confirmed, aggregate payroll accounting snapshot within the trusted scope.
   * @param query - Authenticated actor and complete tenant, organization, company, and run scope.
   * @returns PII-free accounting source evidence.
   * @throws {AccountingIntegrationFailure} When access, confirmation state, or source availability rejects the read.
   */
  readConfirmed(query: PayrollAccountingSnapshotQuery): Promise<ConfirmedPayrollAccountingSnapshot>;
}

/** Reads and validates a confirmed payroll source before a journal plan is made. */
export class ReadConfirmedPayrollAccountingSnapshot {
  /**
   * @param reader - Authorized persistence reader for aggregate payroll evidence.
   * @returns A query use case bound to its source reader.
   */
  public constructor(private readonly reader: PayrollAccountingSnapshotReader) {}

  /**
   * @param query - Trusted server-side source scope.
   * @returns A validated immutable confirmed-payroll snapshot.
   * @throws {AccountingIntegrationFailure} When the query or returned source evidence is invalid.
   */
  public async execute(query: PayrollAccountingSnapshotQuery): Promise<ConfirmedPayrollAccountingSnapshot> {
    validateQuery(query);
    try {
      return validateConfirmedPayrollAccountingSnapshot(await this.reader.readConfirmed(query), query);
    } catch (error) {
      if (error instanceof AccountingIntegrationFailure) throw error;
      throw new AccountingIntegrationFailure(
        "ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE",
        "Confirmed payroll accounting source is unavailable.",
        { cause: error },
      );
    }
  }
}

/**
 * Converts validated aggregate payroll evidence into the planner's confirmed-source event.
 * @param snapshot - Confirmed aggregate source evidence returned by this application boundary.
 * @returns An immutable planner event retaining unknown employer contributions as `null`.
 * @throws {AccountingIntegrationFailure} When reconciliation is not exact or snapshot evidence is malformed.
 */
export function payrollAccountingSnapshotToConfirmedEvent(
  snapshot: ConfirmedPayrollAccountingSnapshot,
): PayrollRunConfirmedAccountingEvent {
  const validated = validateConfirmedPayrollAccountingSnapshot(snapshot, {
    actorId: "validated-snapshot",
    tenantId: snapshot.tenantId,
    organizationId: snapshot.organizationId,
    companyId: snapshot.companyId,
    payrollRunId: snapshot.runId,
  });
  if (validated.roundingDifference.minorAmount !== 0n) {
    throw new AccountingIntegrationFailure(
      "ACCOUNTING_INTEGRATION_AMOUNT_INVALID",
      "Payroll accounting snapshot is not reconciled; its rounding difference must be remediated before planning.",
    );
  }
  return Object.freeze({
    source: "payroll.run_confirmed",
    tenantId: validated.tenantId,
    organizationId: validated.organizationId,
    companyId: validated.companyId,
    payrollRunId: validated.runId,
    payrollRunVersion: validated.sourceVersion,
    effectiveDate: validated.effectiveDate,
    occurredAt: validated.confirmedAt,
    grossEarnings: validated.grossEarnings,
    employeeDeductions: validated.employeeDeductions,
    employerContributions: validated.employerContributions,
    netPay: validated.netPay,
  });
}

/**
 * Validates and freezes aggregate data returned by a payroll source.
 * @param snapshot - Untrusted source response.
 * @param query - Scope originally authorized by the server composition root.
 * @returns A normalized PII-free snapshot.
 * @throws {AccountingIntegrationFailure} When data is foreign, malformed, or has an invalid signed difference.
 */
export function validateConfirmedPayrollAccountingSnapshot(
  snapshot: ConfirmedPayrollAccountingSnapshot,
  query: PayrollAccountingSnapshotQuery,
): ConfirmedPayrollAccountingSnapshot {
  validateQuery(query);
  if (!snapshot || typeof snapshot !== "object" ||
    snapshot.tenantId !== query.tenantId ||
    snapshot.organizationId !== query.organizationId ||
    snapshot.companyId !== query.companyId ||
    snapshot.runId !== query.payrollRunId ||
    snapshot.sourceVersion !== 1) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", "Payroll accounting source returned foreign or unsupported evidence.");
  }
  validateDate(snapshot.effectiveDate, "effective date");
  validateInstant(snapshot.confirmedAt, "confirmation time");
  if (!Number.isSafeInteger(snapshot.receiptCount) || snapshot.receiptCount < 1) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", "Payroll accounting source returned an invalid receipt count.");
  }
  const grossEarnings = requireVesMoney(snapshot.grossEarnings, "gross earnings", false);
  const employeeDeductions = requireVesMoney(snapshot.employeeDeductions, "employee deductions", false);
  const netPay = requireVesMoney(snapshot.netPay, "net pay", false);
  const roundingDifference = requireVesMoney(snapshot.roundingDifference, "rounding difference", true);
  const employerContributions = snapshot.employerContributions === null
    ? null
    : requireVesMoney(snapshot.employerContributions, "employer contributions", false);
  const expectedDifference = netPay.minorAmount + employeeDeductions.minorAmount - grossEarnings.minorAmount;
  if (roundingDifference.minorAmount !== expectedDifference) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", "Payroll accounting source returned an incorrect rounding difference.");
  }
  return Object.freeze({
    tenantId: snapshot.tenantId.trim(),
    organizationId: snapshot.organizationId.trim(),
    companyId: snapshot.companyId.trim(),
    runId: snapshot.runId.trim(),
    sourceVersion: 1,
    effectiveDate: snapshot.effectiveDate,
    confirmedAt: snapshot.confirmedAt,
    receiptCount: snapshot.receiptCount,
    grossEarnings,
    employeeDeductions,
    netPay,
    roundingDifference,
    employerContributions,
  });
}

/**
 * Parses one exact VES(2) decimal sent by the native payroll RPC.
 * @param value - Decimal string from the RPC contract.
 * @param label - Safe field label for diagnostics.
 * @param signed - Whether negative values are permitted.
 * @returns Exact two-decimal VES money.
 * @throws {AccountingIntegrationFailure} When the value cannot be represented exactly.
 */
export function parsePayrollAccountingVes(value: unknown, label: string, signed = false): Money {
  if (typeof value !== "string" || !/^-?\d+\.\d{2}$/.test(value) || (!signed && value.startsWith("-"))) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", `${label} must be an exact VES decimal with two fractional digits.`);
  }
  try {
    const parsed = moneyFromDecimal(value, VES);
    return parsed;
  } catch (cause) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", `${label} is not a valid exact VES amount.`, { cause });
  }
}

function validateQuery(query: PayrollAccountingSnapshotQuery): void {
  if (!query || typeof query !== "object") throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ACCESS_DENIED", "Trusted payroll accounting scope is invalid.");
  for (const [label, value] of Object.entries({ actor: query.actorId, tenant: query.tenantId, organization: query.organizationId, company: query.companyId, payrollRun: query.payrollRunId })) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 128) {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ACCESS_DENIED", `Trusted ${label} scope is invalid.`);
    }
  }
}

function requireVesMoney(value: unknown, label: string, signed: boolean): Money {
  if (!value || typeof value !== "object" || !("minorAmount" in value) || !("currency" in value)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", `${label} is invalid.`);
  }
  const money = value as Money;
  if (money.currency?.code !== "VES" || money.currency.minorUnit !== 2 || typeof money.minorAmount !== "bigint" || (!signed && money.minorAmount < 0n)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", `${label} must be VES with two decimal places.`);
  }
  return money;
}

function validateDate(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", `${label} is invalid.`);
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year!, month! - 1, day!));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month! - 1 || candidate.getUTCDate() !== day) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", `${label} is invalid.`);
}

function validateInstant(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", `${label} is invalid.`);
}
