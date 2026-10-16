import type { TreasuryCommandReceiptDto, TreasuryPageDto, TreasuryReadRow } from "@kontave/client-contracts";
import type { Decoder } from "../../decoding";

/**
 * Decodes a complete, additive treasury command receipt.
 * @param value - Untrusted response payload returned by the transport.
 * @returns A frozen receipt when every required field has the documented shape; otherwise `null`.
 */
export const treasuryCommandReceipt: Decoder<TreasuryCommandReceiptDto> = (value) => {
  const input = record(value);
  if (input === null || typeof input.commandId !== "string" || typeof input.replayed !== "boolean" || !strings(input.affectedIds) || !versions(input.versions)) return null;
  return Object.freeze({ commandId: input.commandId, replayed: input.replayed, affectedIds: Object.freeze([...input.affectedIds]), versions: Object.freeze({ ...input.versions }) });
};

/**
 * Decodes a complete treasury page and validates each discriminated read-model row.
 * @param value - Untrusted response payload returned by the transport.
 * @returns A frozen page when its envelope and every row satisfy the Treasury contract; otherwise `null`.
 */
export const treasuryPage: Decoder<TreasuryPageDto> = (value) => {
  const input = record(value);
  if (input === null || !Array.isArray(input.items) || !input.items.every(treasuryReadRow) || !positiveInteger(input.page) || !positiveInteger(input.pageSize) || !nonNegativeInteger(input.total) || typeof input.asOf !== "string") return null;
  return Object.freeze({ items: Object.freeze([...input.items]), page: input.page, pageSize: input.pageSize, total: input.total, asOf: input.asOf });
};

function treasuryReadRow(value: unknown): value is TreasuryReadRow {
  const row = record(value);
  if (row === null || typeof row.rowKind !== "string") return false;
  switch (row.rowKind) {
    case "cash_box": return stringFields(row, ["id", "code", "name", "currency", "status"]) && positiveInteger(row.version);
    case "bank": return stringFields(row, ["id", "code", "name", "countryCode"]) && positiveInteger(row.version);
    case "beneficiary": return stringFields(row, ["id", "legalName"]) && nullableString(row.taxIdentifier) && oneOf(row.status, ["active", "inactive"]) && positiveInteger(row.version) && Array.isArray(row.bankDetails) && row.bankDetails.every(beneficiaryBankDetail);
    case "bank_account": return stringFields(row, ["id", "bankId", "currency", "holderName", "accountNumberMasked", "status"]) && positiveInteger(row.version);
    case "ledger_entry": return stringFields(row, ["id", "accountId", "direction", "amount", "currency", "movementType", "concept", "status", "operationalDate", "valueDate"]) && nullableString(row.sourceType) && nullableString(row.sourceId) && nullableString(row.sourceLineId) && nullableString(row.responsibleActorId) && oneOf(row.accountKind, ["cash_box", "bank_account"]);
    case "eligible_collection": return stringFields(row, ["collectionId", "receivableId", "receivedAmount", "reservedAmount", "availableAmount", "currency", "receivedAt"]);
    case "checkbook": return stringFields(row, ["id", "bankAccountId"]) && positiveInteger(row.firstNumber) && positiveInteger(row.lastNumber) && positiveInteger(row.nextNumber) && oneOf(row.status, ["active", "closed"]) && positiveInteger(row.version);
    case "check": return stringFields(row, ["id", "bankAccountId", "number", "status", "amount", "currency", "issueDate"]) && positiveInteger(row.version);
    case "check_delivery": return stringFields(row, ["id", "checkId", "eventType", "occurredAt"]) && nullableString(row.recipientName) && nullableString(row.reason) && nullableString(row.evidenceReference);
    case "deposit": return stringFields(row, ["id", "destinationBankAccountId", "amount", "currency", "depositDate", "reference"]);
    case "reconciliation": return stringFields(row, ["id", "bankAccountId", "reason", "createdAt", "createdBy"]) && oneOf(row.state, ["reconciled", "statement_pending", "ledger_pending", "ambiguous"]) && nullableString(row.statementLineId) && nullableString(row.ledgerEntryId) && nullableChoice(row.matchType, ["manual", "automatic"]) && nullableInteger(row.ruleVersion) && positiveInteger(row.version);
    case "reconciliation_history": return stringFields(row, ["id", "bankAccountId", "statementLineId", "ledgerEntryId", "reason", "createdAt", "createdBy"]) && oneOf(row.matchType, ["manual", "automatic"]) && nullableString(row.ruleSetId) && nullableInteger(row.ruleVersion) && oneOf(row.status, ["active", "undone"]) && positiveInteger(row.version) && nullableString(row.undoneAt) && nullableString(row.undoneBy) && nullableString(row.undoReason);
    case "reconciliation_pending": return oneOf(row.state, ["statement_pending", "ledger_pending", "ambiguous"]) && oneOf(row.itemKind, ["statement_line", "ledger_entry"]) && stringFields(row, ["id", "bankAccountId", "amount", "currency", "valueDate", "reference", "reason"]) && nonNegativeInteger(row.ageDays);
    case "reconciliation_preview": return stringFields(row, ["id", "bankAccountId", "ruleSetId", "asOf", "createdAt"]) && positiveInteger(row.ruleVersion) && Array.isArray(row.results) && row.results.every(reconciliationPreviewResult);
    case "exchange_difference": return stringFields(row, ["id", "sourceEntryId", "bankAccountId", "valuationDate", "nativeAmount", "currency", "priorVesAmount", "currentVesAmount", "differenceVesAmount", "priorRate", "currentRate", "priorPolicyVersion", "currentPolicyVersion"]) && oneOf(row.differenceKind, ["realized", "unrealized"]);
    case "balance": return stringFields(row, ["accountId", "currency", "balance"]) && oneOf(row.accountKind, ["cash_box", "bank_account"]);
    case "report": return record(row.values) !== null && Object.values(row.values as Record<string, unknown>).every(scalar);
    default: return false;
  }
}

function beneficiaryBankDetail(value: unknown): boolean { const row = record(value); return row !== null && stringFields(row, ["id", "bankId", "currency", "accountNumberMasked", "accountHolder"]); }
function reconciliationPreviewResult(value: unknown): boolean {
  const row = record(value);
  if (row === null || typeof row.statementLineId !== "string") return false;
  if (row.state === "matched") return typeof row.ledgerEntryId === "string" && typeof row.score === "number" && Number.isFinite(row.score);
  if (row.state === "ambiguous") return strings(row.candidateLedgerEntryIds);
  return row.state === "unmatched" && row.reason === "no_candidate";
}
function stringFields(row: Record<string, unknown>, fields: readonly string[]): boolean { return fields.every((field) => typeof row[field] === "string"); }
function nullableString(value: unknown): boolean { return value === null || typeof value === "string"; }
function nullableInteger(value: unknown): boolean { return value === null || nonNegativeInteger(value); }
function nullableChoice<T extends string>(value: unknown, options: readonly T[]): boolean { return value === null || oneOf(value, options); }
function oneOf<T extends string>(value: unknown, options: readonly T[]): value is T { return typeof value === "string" && options.includes(value as T); }
function scalar(value: unknown): boolean { return value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)); }
function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function strings(value: unknown): value is readonly string[] { return Array.isArray(value) && value.every((item) => typeof item === "string"); }
function versions(value: unknown): value is Readonly<Record<string, number>> { const input = record(value); return input !== null && Object.values(input).every((item) => nonNegativeInteger(item)); }
function positiveInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function nonNegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
