import { addDecimal, compareDecimal, exactDecimal, subtractDecimal, type ExactDecimal } from "@kontave/monetary/domain";
import { TreasuryFailure } from "./failure";

/** A date without time-zone conversion, encoded as YYYY-MM-DD. */
export type LocalDate = string;
/** An exact monetary amount encoded for transport and persistence. */
export type TreasuryAmount = ExactDecimal;
/** Business scope carried by every treasury fact. */
export interface TreasuryScope {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly actorId: string;
}
/** Reproducible VES valuation used when a fact is posted in another currency. */
export interface OperationalValueSnapshot {
  readonly baseCurrency: "VES";
  readonly amount: TreasuryAmount;
  readonly rate: TreasuryAmount;
  readonly source: string;
  readonly asOf: LocalDate;
  readonly policyVersion: string;
  readonly rounding: string;
  readonly minorUnit: number;
}
/** A positive native-currency amount and its exact operational-currency snapshot. */
export interface TreasuryMoney {
  readonly amount: TreasuryAmount;
  readonly currency: string;
  readonly operationalValue: OperationalValueSnapshot;
}
/** Native-currency tolerance used only to compare reconciliation candidates. */
export interface TreasuryTolerance {
  readonly amount: TreasuryAmount;
  readonly currency: string;
}
/** Immutable accounting direction from the company perspective. */
export type TreasuryDirection = "credit" | "debit";
/** Lifecycle of a ledger movement. */
export type TreasuryMovementStatus = "draft" | "posted" | "reversed";
/** Treasury source identity used to prevent a business fact being applied twice. */
export interface TreasurySource {
  readonly type: string;
  readonly id: string;
  readonly lineId?: string;
}
/** An immutable ledger fact. Reversals reference an earlier posted fact. */
export interface TreasuryLedgerEntry {
  readonly id: string;
  readonly accountKind: "cash_box" | "bank_account";
  readonly accountId: string;
  readonly direction: TreasuryDirection;
  readonly money: TreasuryMoney;
  readonly operationalDate: LocalDate;
  readonly valueDate: LocalDate;
  readonly concept: string;
  readonly source?: TreasurySource;
  readonly status: TreasuryMovementStatus;
  readonly reversalOfId?: string;
  readonly version: number;
}
/** Computes signed balance from posted facts and visible reversed facts of one native currency. */
export function balanceFromEntries(entries: readonly TreasuryLedgerEntry[], currency: string): TreasuryAmount {
  let balance = exactDecimal("0");
  for (const entry of entries) {
    if (entry.status === "draft") continue;
    if (entry.money.currency !== currency) throw new TreasuryFailure("INVALID", "Cannot calculate one balance across currencies.");
    balance = entry.direction === "credit"
      ? addDecimal(balance, entry.money.amount)
      : subtractDecimal(balance, entry.money.amount);
  }
  return balance;
}

/** Validates an exact positive monetary payload and stable currency code. */
export function treasuryMoney(value: TreasuryMoney): TreasuryMoney {
  if (!isRecord(value) || !isRecord(value.operationalValue)) throw new TreasuryFailure("INVALID", "Treasury money is invalid.");
  const amount = decimal(value.amount, "Treasury amount");
  if (compareDecimal(amount, exactDecimal("0")) <= 0) throw new TreasuryFailure("INVALID", "Treasury amount must be positive.");
  if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) throw new TreasuryFailure("INVALID", "Currency must be an uppercase ISO-style code.");
  validateOperationalValue(value.operationalValue);
  return value;
}
/** Validates a nonnegative native-currency matching tolerance.
 * @param value - Exact decimal tolerance and ISO-style currency code.
 * @returns The validated tolerance without an operational-currency valuation.
 * @throws {TreasuryFailure} When the amount or currency is invalid.
 */
export function treasuryTolerance(value: TreasuryTolerance): TreasuryTolerance {
  if (!isRecord(value)) throw new TreasuryFailure("INVALID", "Treasury tolerance is invalid.");
  const amount = decimal(value.amount, "Treasury tolerance");
  if (compareDecimal(amount, exactDecimal("0")) < 0) throw new TreasuryFailure("INVALID", "Treasury tolerance cannot be negative.");
  if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) throw new TreasuryFailure("INVALID", "Treasury tolerance currency is invalid.");
  return value;
}

function validateOperationalValue(value: OperationalValueSnapshot): void {
  if (!isRecord(value) || value.baseCurrency !== "VES") throw new TreasuryFailure("INVALID", "Operational valuation is invalid.");
  const amount = decimal(value.amount, "Operational amount");
  const rate = decimal(value.rate, "Operational rate");
  if (compareDecimal(amount, exactDecimal("0")) < 0 || compareDecimal(rate, exactDecimal("0")) <= 0) throw new TreasuryFailure("INVALID", "Operational valuation amounts are invalid.");
  if (!Number.isSafeInteger(value.minorUnit) || value.minorUnit < 0 || value.minorUnit > 100) throw new TreasuryFailure("INVALID", "Operational valuation minor unit is invalid.");
  validateDate(value.asOf, "Operational valuation date");
  requireText(value.source, "Operational valuation source");
  requireText(value.policyVersion, "Operational policy version");
  requireText(value.rounding, "Operational rounding");
}
/** Validates a local operational or value date. */
export function validateDate(value: string, label: string): LocalDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TreasuryFailure("INVALID", `${label} must be an ISO calendar date.`);
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== (month ?? 0) - 1 || candidate.getUTCDate() !== day) throw new TreasuryFailure("INVALID", `${label} must be a real calendar date.`);
  return value;
}
/** Requires a bounded nonblank business identifier or label. */
export function requireText(value: string, label: string, maximum = 512): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new TreasuryFailure("INVALID", `${label} is invalid.`);
  return value;
}
/** Validates the scope required for a tenant-isolated treasury command. */
export function validateScope(scope: TreasuryScope): TreasuryScope {
  if (!isRecord(scope)) throw new TreasuryFailure("INVALID", "Treasury scope is invalid.");
  requireText(scope.tenantId, "Tenant identifier"); requireText(scope.organizationId, "Organization identifier"); requireText(scope.companyId, "Company identifier"); requireText(scope.actorId, "Actor identifier");
  return scope;
}

function decimal(value: unknown, label: string): ExactDecimal {
  if (typeof value !== "string") throw new TreasuryFailure("INVALID", `${label} must be decimal text.`);
  try { return exactDecimal(value); }
  catch (cause: unknown) { throw new TreasuryFailure("INVALID", `${label} is invalid.`, cause instanceof Error ? { cause } : undefined); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
