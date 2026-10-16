import { TreasuryFailure } from "../../domain/failure";
import type { TreasuryScope } from "../../domain/model";
import type { TreasuryCommandRepository } from "../../application/repository";
import type { TreasuryCommandResult, TreasuryWriteCommand } from "../../application/commands";
import type { TreasuryPage, TreasuryQuery, TreasuryQueryRepository, TreasuryReadRow, TreasuryReconciliationPreviewResult } from "../../application/queries";

/** JSON RPC boundary implemented by the PostgreSQL shared operational schema. */
export interface TreasuryPostgresRpcClient {
  /**
   * Executes one database function in the request's trusted server transaction.
   * @param functionName - Whitelisted function name exposed by the shared schema.
   * @param argumentsValue - Structurally serializable function arguments.
   * @returns Decoded function result or an adapter failure.
   * @throws {TreasuryFailure} When the call cannot reach PostgreSQL.
   */
  call(functionName: "shared_treasury_execute_command" | "shared_treasury_query", argumentsValue: Readonly<Record<string, unknown>>): Promise<unknown>;
}
/** Calls the shared SQL command function; PostgreSQL owns locking, RLS, idempotency and atomicity. */
export class PostgresTreasuryRepository implements TreasuryCommandRepository, TreasuryQueryRepository {
  /** @param client - Trusted server PostgreSQL RPC client. */
  public constructor(private readonly client: TreasuryPostgresRpcClient) {}
  /** {@inheritDoc TreasuryCommandRepository.execute} */
  public async execute(scope: TreasuryScope, command: TreasuryWriteCommand): Promise<TreasuryCommandResult> {
    const raw = await this.call("shared_treasury_execute_command", { p_scope: scope, p_command: command });
    return decodeCommandResult(raw);
  }
  /** {@inheritDoc TreasuryQueryRepository.query} */
  public async query(scope: TreasuryScope, query: TreasuryQuery): Promise<TreasuryPage<TreasuryReadRow>> {
    const raw = await this.call("shared_treasury_query", { p_scope: scope, p_query: query });
    return decodePage(raw, query.kind);
  }
  private async call(name: "shared_treasury_execute_command" | "shared_treasury_query", argumentsValue: Readonly<Record<string, unknown>>): Promise<unknown> {
    try { return await this.client.call(name, argumentsValue); }
    catch (cause: unknown) { if (cause instanceof TreasuryFailure) throw cause; throw postgresFailure(cause); }
  }
}
export * from "./payment-order-execution-reader";
function decodeCommandResult(value: unknown): TreasuryCommandResult {
  const record = object(value); const commandId = text(record.commandId, "commandId"); const replayed = record.replayed; const affectedIds = record.affectedIds; const versions = record.versions;
  if (typeof replayed !== "boolean" || !Array.isArray(affectedIds) || !affectedIds.every(item => typeof item === "string") || !isVersionRecord(versions)) throw new TreasuryFailure("UNAVAILABLE", "Treasury command response is malformed.");
  return { commandId, replayed, affectedIds, versions };
}
function decodePage(value: unknown, kind: TreasuryQuery["kind"]): TreasuryPage<TreasuryReadRow> {
  const record = object(value);
  const { items, page, pageSize, total, asOf } = record;
  if (!Array.isArray(items) || !Number.isSafeInteger(page) || !Number.isSafeInteger(pageSize) || !Number.isSafeInteger(total) || typeof asOf !== "string") throw new TreasuryFailure("UNAVAILABLE", "Treasury query response is malformed.");
  return { items: items.map(item => decodeRow(item, kind)), page: page as number, pageSize: pageSize as number, total: total as number, asOf };
}
function decodeRow(value: unknown, kind: TreasuryQuery["kind"]): TreasuryReadRow {
  const row = object(value); const id = optionalText(field(row, "id"));
  if (kind === "list_cash_boxes") return { rowKind: "cash_box", id: required(id, "id"), code: stringField(row, "code"), name: stringField(row, "name"), currency: currency(field(row, "currency")), status: stringField(row, "status"), version: numberField(row, "version") };
  if (kind === "list_banks") return { rowKind: "bank", id: required(id, "id"), code: stringField(row, "code"), name: stringField(row, "name"), countryCode: countryCode(field(row, "countryCode")), version: numberField(row, "version") };
  if (kind === "list_beneficiaries") return beneficiaryRow(row, id);
  if (kind === "list_bank_accounts") return { rowKind: "bank_account", id: required(id, "id"), bankId: stringField(row, "bankId"), currency: currency(field(row, "currency")), holderName: stringField(row, "holderName"), accountNumberMasked: stringField(row, "accountNumberMasked"), status: stringField(row, "status"), version: numberField(row, "version") };
  if (kind === "get_balance") return { rowKind: "balance", accountId: stringField(row, "accountId"), accountKind: accountKind(field(row, "accountKind")), currency: currency(field(row, "currency")), balance: exactNumber(row.balance) };
  if (kind === "list_ledger_entries") return { rowKind: "ledger_entry", id: required(id, "id"), accountId: stringField(row, "accountId"), accountKind: accountKind(field(row, "accountKind")), direction: direction(row.direction), amount: exactNumber(row.amount), currency: currency(field(row, "currency")), movementType: stringField(row, "movementType"), concept: stringField(row, "concept"), sourceType: nullableText(field(row, "sourceType")), sourceId: nullableText(field(row, "sourceId")), sourceLineId: nullableText(field(row, "sourceLineId")), status: stringField(row, "status"), operationalDate: stringField(row, "operationalDate"), valueDate: stringField(row, "valueDate"), responsibleActorId: nullableText(field(row, "responsibleActorId")), version: numberField(row, "version") };
  if (kind === "list_eligible_collections") return { rowKind: "eligible_collection", collectionId: stringField(row, "collectionId"), receivableId: stringField(row, "receivableId"), receivedAmount: exactNumber(row.receivedAmount), reservedAmount: exactNumber(row.reservedAmount), availableAmount: exactNumber(row.availableAmount), currency: currency(field(row, "currency")), receivedAt: stringField(row, "receivedAt") };
  if (kind === "list_checkbooks") return checkbookRow(row, id);
  if (kind === "list_checks") return { rowKind: "check", id: required(id, "id"), bankAccountId: stringField(row, "bankAccountId"), number: exactNumber(row.number), status: stringField(row, "status"), amount: exactNumber(row.amount), currency: currency(field(row, "currency")), issueDate: stringField(row, "issueDate"), version: numberField(row, "version") };
  if (kind === "list_check_deliveries") return { rowKind: "check_delivery", id: required(id, "id"), checkId: stringField(row, "checkId"), eventType: stringField(row, "eventType"), recipientName: nullableText(field(row, "recipientName")), occurredAt: stringField(row, "occurredAt"), reason: nullableText(row.reason), evidenceReference: nullableText(field(row, "evidenceReference")) };
  if (kind === "list_deposits") return { rowKind: "deposit", id: required(id, "id"), destinationBankAccountId: stringField(row, "destinationBankAccountId"), amount: exactNumber(row.amount), currency: currency(field(row, "currency")), depositDate: stringField(row, "depositDate"), reference: stringField(row, "reference") };
  if (kind === "list_reconciliation_items") return reconciliationRow(row, id);
  if (kind === "list_reconciliation_rules") {
    const active = field(row, "active");
    if (typeof active !== "boolean") throw new TreasuryFailure("UNAVAILABLE", "Treasury database reconciliation-rule status is malformed.");
    return { rowKind: "reconciliation_rule", id: required(id, "id"), bankAccountId: stringField(row, "bankAccountId"), activeFrom: stringField(row, "activeFrom"), dateWindowDays: numberField(row, "dateWindowDays"), toleranceAmount: exactNumber(row.toleranceAmount), currency: currency(field(row, "currency")), referenceWeight: exactNumber(row.referenceWeight), dateWeight: exactNumber(row.dateWeight), version: numberField(row, "version"), active };
  }
  if (kind === "list_reconciliation_statements") {
    const status = field(row, "status");
    if (status !== "open" && status !== "closed") throw new TreasuryFailure("UNAVAILABLE", "Treasury database statement status is malformed.");
    return { rowKind: "reconciliation_statement", id: required(id, "id"), bankAccountId: stringField(row, "bankAccountId"), periodStart: stringField(row, "periodStart"), periodEnd: stringField(row, "periodEnd"), externalReference: stringField(row, "externalReference"), status, version: numberField(row, "version"), closedAt: nullableText(field(row, "closedAt")), differenceExplanation: nullableText(field(row, "differenceExplanation")) };
  }
  if (kind === "list_reconciliation_history") {
    const status = field(row, "status");
    if (status !== "active" && status !== "undone") throw new TreasuryFailure("UNAVAILABLE", "Treasury database reconciliation history status is malformed.");
    return { rowKind: "reconciliation_history", id: required(id, "id"), bankAccountId: stringField(row, "bankAccountId"), statementLineId: stringField(row, "statementLineId"), ledgerEntryId: stringField(row, "ledgerEntryId"), matchType: matchType(field(row, "matchType")), ruleSetId: nullableText(field(row, "ruleSetId")), ruleVersion: field(row, "ruleVersion") === null ? null : numberField(row, "ruleVersion"), reason: stringField(row, "reason"), status, createdAt: stringField(row, "createdAt"), createdBy: stringField(row, "createdBy"), version: numberField(row, "version"), undoneAt: nullableText(field(row, "undoneAt")), undoneBy: nullableText(field(row, "undoneBy")), undoReason: nullableText(field(row, "undoReason")) };
  }
  if (kind === "get_reconciliation_preview") {
    const results = field(row, "results"); if (!Array.isArray(results)) throw new TreasuryFailure("UNAVAILABLE", "Treasury database preview results are malformed.");
    return { rowKind: "reconciliation_preview", id: required(id, "id"), bankAccountId: stringField(row, "bankAccountId"), ruleSetId: stringField(row, "ruleSetId"), ruleVersion: numberField(row, "ruleVersion"), asOf: stringField(row, "asOf"), results: results.map(decodePreviewResult), createdAt: stringField(row, "createdAt") };
  }
  if (kind === "list_bank_debit_tax_policies") {
    const active = field(row, "active"); const subjectTypes = field(row, "subjectTypes");
    if (typeof active !== "boolean" || !Array.isArray(subjectTypes) || !subjectTypes.every(value => value === "bank_debit" || value === "check_issue")) throw new TreasuryFailure("UNAVAILABLE", "Treasury database tax-policy row is malformed.");
    return { rowKind: "bank_debit_tax_policy", id: required(id, "id"), effectiveFrom: stringField(row, "effectiveFrom"), effectiveTo: nullableText(field(row, "effectiveTo")), ratePercent: exactNumber(field(row, "ratePercent")), baseCurrency: currency(field(row, "baseCurrency")), rounding: stringField(row, "rounding"), legalBasis: stringField(row, "legalBasis"), approvalReference: stringField(row, "approvalReference"), subjectTypes, version: numberField(row, "version"), active };
  }
  if (kind === "list_bank_debit_tax_assessments") return { rowKind: "bank_debit_tax_assessment", id: required(id, "id"), ledgerEntryId: stringField(row, "ledgerEntryId"), bankAccountId: stringField(row, "bankAccountId"), movementType: stringField(row, "movementType"), concept: stringField(row, "concept"), operationalDate: stringField(row, "operationalDate"), entryVersion: numberField(row, "entryVersion"), policyId: stringField(row, "policyId"), policyVersion: numberField(row, "policyVersion"), ratePercent: exactNumber(field(row, "ratePercent")), taxableAmount: exactNumber(field(row, "taxableAmount")), taxAmount: exactNumber(field(row, "taxAmount")), currency: currency(field(row, "currency")), exclusionId: nullableText(field(row, "exclusionId")), exclusionReason: nullableText(field(row, "exclusionReason")), evidenceReference: nullableText(field(row, "evidenceReference")) };
  if (kind === "get_payment_order_execution") return { rowKind: "payment_order_execution", paymentId: stringField(row, "paymentId"), paymentOrderId: stringField(row, "paymentOrderId"), amount: exactNumber(field(row, "amount")), currency: currency(field(row, "currency")), occurredOn: stringField(row, "occurredOn"), ledgerEntryId: stringField(row, "ledgerEntryId") };
  if (kind === "list_exchange_differences") return exchangeDifferenceRow(row, id);
  if (kind === "treasury_report") return { rowKind: "report", values: reportValues(row) };
  return { rowKind: "balance", accountId: stringField(row, "accountId"), accountKind: accountKind(field(row, "accountKind")), currency: currency(field(row, "currency")), balance: exactNumber(row.balance) };
}
function checkbookRow(row: Readonly<Record<string, unknown>>, id: string | undefined): TreasuryReadRow {
  const status = field(row, "status");
  if (status !== "active" && status !== "closed") throw new TreasuryFailure("UNAVAILABLE", "Treasury database checkbook status is malformed.");
  const firstNumber = numberField(row, "firstNumber"); const lastNumber = numberField(row, "lastNumber"); const nextNumber = numberField(row, "nextNumber");
  if (firstNumber < 1 || lastNumber < firstNumber || nextNumber < firstNumber || nextNumber > lastNumber + 1) throw new TreasuryFailure("UNAVAILABLE", "Treasury database checkbook range is malformed.");
  return { rowKind: "checkbook", id: required(id, "id"), bankAccountId: stringField(row, "bankAccountId"), firstNumber, lastNumber, nextNumber, status, version: numberField(row, "version") };
}
function beneficiaryRow(row: Readonly<Record<string, unknown>>, id: string | undefined): TreasuryReadRow {
  const status = field(row, "status"); const details = field(row, "bankDetails");
  if (status !== "active" && status !== "inactive") throw new TreasuryFailure("UNAVAILABLE", "Treasury database beneficiary status is malformed.");
  if (!Array.isArray(details)) throw new TreasuryFailure("UNAVAILABLE", "Treasury database beneficiary bank details are malformed.");
  return { rowKind: "beneficiary", id: required(id, "id"), legalName: stringField(row, "legalName"), taxIdentifier: nullableText(field(row, "taxIdentifier")), status, version: numberField(row, "version"), bankDetails: details.map(value => { const detail = object(value); return { id: stringField(detail, "id"), bankId: stringField(detail, "bankId"), currency: currency(field(detail, "currency")), accountNumberMasked: stringField(detail, "accountNumberMasked"), accountHolder: stringField(detail, "accountHolder") }; }) };
}
function exchangeDifferenceRow(row: Readonly<Record<string, unknown>>, id: string | undefined): TreasuryReadRow {
  const differenceKind = field(row, "differenceKind");
  if (differenceKind !== "realized" && differenceKind !== "unrealized") throw new TreasuryFailure("UNAVAILABLE", "Treasury database exchange-difference classification is malformed.");
  return { rowKind: "exchange_difference", id: required(id, "id"), sourceEntryId: stringField(row, "sourceEntryId"), bankAccountId: stringField(row, "bankAccountId"), differenceKind, valuationDate: stringField(row, "valuationDate"), nativeAmount: exactNumber(field(row, "nativeAmount")), currency: currency(field(row, "currency")), priorVesAmount: exactNumber(field(row, "priorVesAmount")), currentVesAmount: exactNumber(field(row, "currentVesAmount")), differenceVesAmount: exactNumber(field(row, "differenceVesAmount")), priorRate: exactNumber(field(row, "priorRate")), currentRate: exactNumber(field(row, "currentRate")), priorPolicyVersion: stringField(row, "priorPolicyVersion"), currentPolicyVersion: stringField(row, "currentPolicyVersion") };
}
function decodePreviewResult(value: unknown): TreasuryReconciliationPreviewResult {
  const row = object(value); const statementLineId = stringField(row, "statementLineId"); const state = field(row, "state");
  if (state === "matched") {
    const score = field(row, "score");
    if (typeof score !== "number" || !Number.isFinite(score)) throw new TreasuryFailure("UNAVAILABLE", "Treasury database preview score is malformed.");
    return { statementLineId, state, ledgerEntryId: stringField(row, "ledgerEntryId"), score };
  }
  if (state === "ambiguous") {
    const candidates = field(row, "candidateLedgerEntryIds");
    if (!Array.isArray(candidates) || !candidates.every(candidate => typeof candidate === "string" && candidate.length > 0)) throw new TreasuryFailure("UNAVAILABLE", "Treasury database preview candidates are malformed.");
    return { statementLineId, state, candidateLedgerEntryIds: candidates };
  }
  if (state === "unmatched" && field(row, "reason") === "no_candidate") return { statementLineId, state, reason: "no_candidate" };
  throw new TreasuryFailure("UNAVAILABLE", "Treasury database preview outcome is malformed.");
}
function object(value: unknown): Readonly<Record<string, unknown>> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TreasuryFailure("UNAVAILABLE", "Treasury database response is malformed."); return value as Readonly<Record<string, unknown>>; }
function text(value: unknown, name: string): string { if (typeof value !== "string" || !value) throw new TreasuryFailure("UNAVAILABLE", `Treasury database response ${name} is malformed.`); return value; }
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }
function required(value: string | undefined, name: string): string { if (!value) throw new TreasuryFailure("UNAVAILABLE", `Treasury database response ${name} is malformed.`); return value; }
function stringField(row: Readonly<Record<string, unknown>>, name: string): string { return text(field(row, name), name); }
function numberField(row: Readonly<Record<string, unknown>>, name: string): number { const value = field(row, name); const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN; if (!Number.isSafeInteger(parsed) || parsed < 0) throw new TreasuryFailure("UNAVAILABLE", `Treasury database response ${name} is malformed.`); return parsed; }
function exactNumber(value: unknown): string { if ((typeof value !== "string" && typeof value !== "number") || !/^-?\d+(?:\.\d+)?$/.test(String(value))) throw new TreasuryFailure("UNAVAILABLE", "Treasury database amount is malformed."); return String(value); }
function currency(value: unknown): string { const result = text(value, "currency"); if (!/^[A-Z]{3}$/.test(result)) throw new TreasuryFailure("UNAVAILABLE", "Treasury database currency is malformed."); return result; }
function countryCode(value: unknown): string { const result = text(value, "countryCode"); if (!/^[A-Z]{2}$/.test(result)) throw new TreasuryFailure("UNAVAILABLE", "Treasury database country code is malformed."); return result; }
function accountKind(value: unknown): "cash_box" | "bank_account" { if (value === "cash_box" || value === "bank_account") return value; throw new TreasuryFailure("UNAVAILABLE", "Treasury database account kind is malformed."); }
function direction(value: unknown): "credit" | "debit" { if (value === "credit" || value === "debit") return value; throw new TreasuryFailure("UNAVAILABLE", "Treasury database direction is malformed."); }
function matchType(value: unknown): "manual" | "automatic" { if (value === "manual" || value === "automatic") return value; throw new TreasuryFailure("UNAVAILABLE", "Treasury database reconciliation match type is malformed."); }
function nullableText(value: unknown): string | null { if (value === null || value === undefined) return null; if (typeof value !== "string") throw new TreasuryFailure("UNAVAILABLE", "Treasury database nullable text is malformed."); return value; }
function nullableMatchType(value: unknown): "manual" | "automatic" | null { return value === null || value === undefined ? null : matchType(value); }
function reconciliationRow(row: Readonly<Record<string, unknown>>, id: string | undefined): TreasuryReadRow {
  const itemKind = field(row, "itemKind");
  if (itemKind === "statement_line" || itemKind === "ledger_entry") {
    return { rowKind: "reconciliation_pending", state: pendingState(itemKind, field(row, "state")), itemKind, id: required(id, "id"), bankAccountId: stringField(row, "bankAccountId"), amount: exactNumber(row.amount), currency: currency(field(row, "currency")), direction: direction(field(row, "direction")), valueDate: stringField(row, "valueDate"), reference: stringField(row, "reference"), ageDays: numberField(row, "ageDays"), reason: stringField(row, "reason"), version: numberField(row, "version") };
  }
  const ruleVersion = field(row, "ruleVersion");
  return { rowKind: "reconciliation", id: required(id, "id"), bankAccountId: stringField(row, "bankAccountId"), state: reconciliationState(field(row, "state"), "reconciled"), statementLineId: nullableText(field(row, "statementLineId")), ledgerEntryId: nullableText(field(row, "ledgerEntryId")), matchType: nullableMatchType(field(row, "matchType")), ruleVersion: ruleVersion === null || ruleVersion === undefined ? null : numberField(row, "ruleVersion"), reason: stringField(row, "reason"), createdAt: stringField(row, "createdAt"), createdBy: stringField(row, "createdBy"), version: numberField(row, "version") };
}
function pendingState(itemKind: "statement_line" | "ledger_entry", value: unknown): "statement_pending" | "ledger_pending" | "ambiguous" { if (value === "ambiguous") return value; if (value === undefined || value === null) return itemKind === "statement_line" ? "statement_pending" : "ledger_pending"; if (value === "statement_pending" || value === "ledger_pending") return value; throw new TreasuryFailure("UNAVAILABLE", "Treasury database reconciliation pending state is malformed."); }
function reconciliationState(value: unknown, fallback?: "reconciled" | "statement_pending" | "ledger_pending" | "ambiguous"): "reconciled" | "statement_pending" | "ledger_pending" | "ambiguous" { if (value === undefined && fallback !== undefined) return fallback; if (value === "reconciled" || value === "statement_pending" || value === "ledger_pending" || value === "ambiguous") return value; throw new TreasuryFailure("UNAVAILABLE", "Treasury database reconciliation state is malformed."); }
function field(row: Readonly<Record<string, unknown>>, camelName: string): unknown { if (Object.hasOwn(row, camelName)) return row[camelName]; const snakeName = camelName.replace(/[A-Z]/g, character => `_${character.toLowerCase()}`); return row[snakeName]; }
function reportValues(row: Readonly<Record<string, unknown>>): Readonly<Record<string, string | number | boolean | null>> { const result: Record<string, string | number | boolean | null> = {}; for (const [key, value] of Object.entries(row)) { if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) result[key] = value; else throw new TreasuryFailure("UNAVAILABLE", "Treasury report row contains a non-scalar value."); } return result; }
function isVersionRecord(value: unknown): value is Readonly<Record<string, number>> { return !!value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every(item => Number.isSafeInteger(item) && item > 0); }
/** Converts the stable SQL failure prefix into the portable Treasury failure vocabulary. */
function postgresFailure(cause: unknown): TreasuryFailure {
  const message = cause instanceof Error ? cause.message : "Treasury PostgreSQL adapter is unavailable.";
  const code = treasurySqlCode(message);
  if (!code) return cause instanceof Error ? new TreasuryFailure("UNAVAILABLE", "Treasury PostgreSQL adapter is unavailable.", { cause }) : new TreasuryFailure("UNAVAILABLE", "Treasury PostgreSQL adapter is unavailable.");
  return cause instanceof Error ? new TreasuryFailure(code, message, { cause }) : new TreasuryFailure(code, message);
}
function treasurySqlCode(message: string): TreasuryFailure["code"] | undefined {
  const candidate = /TREASURY_([A-Z_]+)/.exec(message)?.[1];
  const codes = ["INVALID", "NOT_FOUND", "CONFLICT", "FORBIDDEN", "INSUFFICIENT_FUNDS", "CLOSED_PERIOD", "IDEMPOTENCY_CONFLICT", "SOURCE_ALREADY_APPLIED", "AMBIGUOUS_RECONCILIATION"] as const;
  return codes.find(code => code === candidate);
}
