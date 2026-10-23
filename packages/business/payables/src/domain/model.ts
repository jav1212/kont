import { addDecimal, compareDecimal, exactDecimal, subtractDecimal, type ExactDecimal } from "@kontave/monetary/domain";
import { PayablesFailure } from "./failure";

/** A date without time-zone conversion, encoded as YYYY-MM-DD. */
export type LocalDate = string;
/** Tenant and company identity bound to a payable operation. */
export interface PayablesScope {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly actorId: string;
}
/** Authoritative historical VES valuation attached to a payable document. */
export interface PayablesRateSnapshot {
  readonly amount: ExactDecimal;
  readonly baseCurrency: "VES";
  readonly rate: ExactDecimal;
  readonly source: string;
  readonly effectiveDate: LocalDate;
  readonly policyVersion: string;
  readonly rounding: "half_up";
}
/** Lifecycle state of one supplier obligation. */
export type PayableStatus = "open" | "settled" | "voided";
/** Origin and nature of a payable document. */
export type PayableDocumentKind = "invoice" | "debit_note" | "manual_document" | "credit_note" | "positive_adjustment" | "negative_adjustment" | "installment" | "opening_balance";
/** Whether a document increases what is owed (`debit`) or is a credit available to apply (`credit`). */
export type PayableSide = "debit" | "credit";
/** Immutable obligation facts and its current optimistic concurrency version. */
export interface PayableDocument {
  readonly id: string;
  readonly supplierId: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly kind: PayableDocumentKind;
  readonly documentNumber: string;
  readonly concept: string;
  readonly issuedAt: LocalDate;
  readonly dueAt: LocalDate;
  readonly currency: string;
  readonly principal: ExactDecimal;
  readonly rateSnapshot: PayablesRateSnapshot;
  readonly status: PayableStatus;
  readonly version: number;
}
/** Versioned reason for changing a document due date. */
export interface DueDateChange {
  readonly id: string;
  readonly documentId: string;
  readonly previousDueAt: LocalDate;
  readonly dueAt: LocalDate;
  readonly reason: string;
  readonly actorId: string;
  readonly changedAt: string;
}
/** A permanent application that reduces the supplier debt on one document. */
export interface PayableApplication {
  readonly id: string;
  readonly documentId: string;
  readonly kind: "payment" | "credit_note" | "negative_adjustment" | "withholding_vat" | "withholding_islr" | "installment_transfer";
  readonly amount: ExactDecimal;
  /** Credit document consumed by this application, when it comes from a credit. */
  readonly creditDocumentId?: string;
  readonly occurredAt: LocalDate;
  readonly reversedAt?: LocalDate;
}

/**
 * Classifies a document kind by its effect on the supplier balance.
 *
 * @param kind - Payable document kind.
 * @returns `credit` for credit notes and negative adjustments, otherwise `debit`.
 * @throws Never; every supported kind has a side.
 */
export function payableSide(kind: PayableDocumentKind): PayableSide {
  return kind === "credit_note" || kind === "negative_adjustment" ? "credit" : "debit";
}

/** Validates an ISO calendar date without allowing JavaScript rollover. */
export function validatePayablesDate(value: string, label: string): LocalDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new PayablesFailure("INVALID", `${label} must be an ISO calendar date.`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== (month ?? 0) - 1 || date.getUTCDate() !== day) throw new PayablesFailure("INVALID", `${label} must be a real calendar date.`);
  return value;
}

/** Validates an immutable document before a repository persists it. */
export function validatePayableDocument(document: PayableDocument): PayableDocument {
  if (!document.id.trim() || !document.supplierId.trim() || !document.sourceType.trim() || !document.sourceId.trim()) throw new PayablesFailure("INVALID", "Payable document identity is required.");
  if (!/^[A-Z]{3}$/.test(document.currency)) throw new PayablesFailure("INVALID", "Payable currency must be an uppercase three-letter code.");
  if (compareDecimal(exactDecimal(document.principal), exactDecimal("0")) <= 0) throw new PayablesFailure("INVALID", "Payable principal must be positive.");
  validatePayablesDate(document.issuedAt, "Issue date");
  validatePayablesDate(document.dueAt, "Due date");
  validatePayablesDate(document.rateSnapshot.effectiveDate, "Rate date");
  if (document.dueAt < document.issuedAt) throw new PayablesFailure("INVALID", "Due date cannot precede the issue date.");
  if (document.rateSnapshot.baseCurrency !== "VES" || compareDecimal(document.rateSnapshot.rate, exactDecimal("0")) <= 0 || document.rateSnapshot.rounding !== "half_up") throw new PayablesFailure("INVALID", "Payable rate snapshot is invalid.");
  if (!Number.isSafeInteger(document.version) || document.version < 1) throw new PayablesFailure("INVALID", "Payable version is invalid.");
  return document;
}

/** Computes the remaining native-currency debt from active applications. */
export function payableBalance(document: PayableDocument, applications: readonly PayableApplication[]): ExactDecimal {
  let applied = exactDecimal("0");
  for (const application of applications) {
    if (application.documentId !== document.id) throw new PayablesFailure("INVALID", "An application belongs to a different payable document.");
    if (compareDecimal(application.amount, exactDecimal("0")) <= 0) throw new PayablesFailure("INVALID", "A payable application must be positive.");
    if (!application.reversedAt) applied = addDecimal(applied, application.amount);
  }
  const balance = subtractDecimal(document.principal, applied);
  if (compareDecimal(balance, exactDecimal("0")) < 0) throw new PayablesFailure("EXCEEDS_BALANCE", "Applications exceed the payable principal.");
  return balance;
}
