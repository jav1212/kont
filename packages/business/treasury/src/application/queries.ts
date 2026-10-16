import { requireText, validateDate, validateScope, type LocalDate, type TreasuryScope } from "../domain/model";
import { TreasuryFailure } from "../domain/failure";

/** Query filters and report requests served by the authorized treasury read model. */
export type TreasuryQuery =
  | ListCashBoxesQuery | ListBanksQuery | ListBeneficiariesQuery | ListBankAccountsQuery | GetBalanceQuery | ListLedgerEntriesQuery | ListEligibleCollectionsQuery
  | ListCheckbooksQuery | ListChecksQuery | ListCheckDeliveriesQuery | ListDepositsQuery | ListReconciliationItemsQuery | ListReconciliationRulesQuery | ListReconciliationStatementsQuery | ListExchangeDifferencesQuery
  | TreasuryReportQuery | GetReconciliationPreviewQuery | ListReconciliationHistoryQuery
  | ListBankDebitTaxPoliciesQuery | ListBankDebitTaxAssessmentsQuery | GetPaymentOrderExecutionQuery;
/** All read requests retain the same tenant, organization, company and actor scope. */
export interface TreasuryScopedQuery extends TreasuryScope { readonly page: number; readonly pageSize: number; }
/** TES-002 lists cash boxes. */
export interface ListCashBoxesQuery extends TreasuryScopedQuery { readonly kind: "list_cash_boxes"; readonly cashBoxId?: string; readonly currency?: string; readonly status?: "active" | "inactive"; }
/** TES-003 reads the company-scoped bank master used by bank accounts. */
export interface ListBanksQuery extends TreasuryScopedQuery { readonly kind: "list_banks"; readonly search?: string; }
/** TES-027 reads beneficiaries and only returns masked account details. */
export interface ListBeneficiariesQuery extends TreasuryScopedQuery { readonly kind: "list_beneficiaries"; readonly status?: "active" | "inactive"; readonly search?: string; }
/** TES-005 lists bank accounts with sensitive fields masked by the read model. */
export interface ListBankAccountsQuery extends TreasuryScopedQuery { readonly kind: "list_bank_accounts"; readonly bankAccountId?: string; readonly bankId?: string; readonly currency?: string; readonly status?: "active" | "inactive"; }
/** TES-007 obtains reproducible account balance at a business date. */
export interface GetBalanceQuery extends TreasuryScopedQuery { readonly kind: "get_balance"; readonly accountKind: "cash_box" | "bank_account"; readonly accountId: string; readonly asOf: LocalDate; }
/** TES-036/037 lists bank or cash ledger movements with reversals and responsible actor visible. */
export interface ListLedgerEntriesQuery extends TreasuryScopedQuery { readonly kind: "list_ledger_entries"; readonly accountKind: "cash_box" | "bank_account"; readonly accountId: string; readonly from: LocalDate; readonly to: LocalDate; readonly movementType?: string; readonly status?: "draft" | "posted" | "reversed"; readonly sourceType?: string; readonly responsibleActorId?: string; }
/** TES-016 lists emitted checks by account, folio, beneficiary, date, or lifecycle state. */
export interface ListChecksQuery extends TreasuryScopedQuery { readonly kind: "list_checks"; readonly bankAccountId?: string; readonly checkbookId?: string; readonly number?: string; readonly beneficiaryId?: string; readonly from?: LocalDate; readonly to?: LocalDate; readonly status?: string; }
/** TES-015/017 lists checkbooks and the next atomically claimable folio. */
export interface ListCheckbooksQuery extends TreasuryScopedQuery { readonly kind: "list_checkbooks"; readonly bankAccountId?: string; readonly status?: "active" | "closed"; }
/** TES-020 lists delivery workflow facts. */
export interface ListCheckDeliveriesQuery extends TreasuryScopedQuery { readonly kind: "list_check_deliveries"; readonly bankAccountId?: string; readonly status?: "pending" | "delivered" | "undone"; }
/** TES-021/022 lists deposits and reserved collections. */
export interface ListDepositsQuery extends TreasuryScopedQuery { readonly kind: "list_deposits"; readonly destinationBankAccountId?: string; readonly from?: LocalDate; readonly to?: LocalDate; }
/** TES-022 lists received Sales collections with the remaining amount available for one deposit. */
export interface ListEligibleCollectionsQuery extends TreasuryScopedQuery { readonly kind: "list_eligible_collections"; readonly currency?: string; }
/** TES-031/032 reads reconciled, pending, or ambiguous statement and ledger items. */
export interface ListReconciliationItemsQuery extends TreasuryScopedQuery { readonly kind: "list_reconciliation_items"; readonly bankAccountId: string; readonly state: "reconciled" | "statement_pending" | "ledger_pending" | "ambiguous"; readonly from?: LocalDate; readonly to?: LocalDate; }
/** TES-030 lists immutable reconciliation rule versions for one bank account. */
export interface ListReconciliationRulesQuery extends TreasuryScopedQuery { readonly kind: "list_reconciliation_rules"; readonly bankAccountId: string; }
/** TES-032 lists imported statement cuts and their optimistic-concurrency state. */
export interface ListReconciliationStatementsQuery extends TreasuryScopedQuery { readonly kind: "list_reconciliation_statements"; readonly bankAccountId: string; readonly status?: "open" | "closed"; }
/** TES-030 reads an immutable preview snapshot tied to one exact rule version. */
export interface GetReconciliationPreviewQuery extends TreasuryScopedQuery { readonly kind: "get_reconciliation_preview"; readonly previewId: string; }
/** TES-031 reads current and compensated links, including actor, reason, date and undo history. */
export interface ListReconciliationHistoryQuery extends TreasuryScopedQuery { readonly kind: "list_reconciliation_history"; readonly bankAccountId: string; readonly from?: LocalDate; readonly to?: LocalDate; }
/** TES-034 reads versioned, approved bank-debit tax policies for one company. */
export interface ListBankDebitTaxPoliciesQuery extends TreasuryScopedQuery { readonly kind: "list_bank_debit_tax_policies"; }
/** TES-034/035 reads calculated tax and its auditable exclusion evidence. */
export interface ListBankDebitTaxAssessmentsQuery extends TreasuryScopedQuery { readonly kind: "list_bank_debit_tax_assessments"; }
/** Reads the single Treasury execution fact linked to one payment order. */
export interface GetPaymentOrderExecutionQuery extends TreasuryScopedQuery { readonly kind: "get_payment_order_execution"; readonly paymentOrderId: string; }
/** TES-033 lists immutable realized and unrealized valuation differences without including them in native cash balances. */
export interface ListExchangeDifferencesQuery extends TreasuryScopedQuery { readonly kind: "list_exchange_differences"; readonly bankAccountId?: string; readonly from?: LocalDate; readonly to?: LocalDate; readonly differenceKind?: "realized" | "unrealized"; }
/** TES-038 creates an authorized data snapshot that an external CSV/PDF renderer consumes. */
export interface TreasuryReportQuery extends TreasuryScopedQuery { readonly kind: "treasury_report"; readonly report: "cash_ledger" | "bank_ledger" | "balances" | "checks" | "deposits" | "payments" | "reconciliation"; readonly from: LocalDate; readonly to: LocalDate; readonly accountId?: string; readonly currency?: string; }
/** A page returned by durable Treasury queries. */
export interface TreasuryPage<T> { readonly items: readonly T[]; readonly page: number; readonly pageSize: number; readonly total: number; readonly asOf: string; }
/** Typed records returned by the Treasury SQL read model after adapter normalization. */
export type TreasuryReadRow = TreasuryCashBoxRow | TreasuryBankRow | TreasuryBeneficiaryRow | TreasuryBankAccountRow | TreasuryLedgerRow | TreasuryEligibleCollectionRow | TreasuryCheckbookRow | TreasuryCheckRow | TreasuryCheckDeliveryRow | TreasuryDepositRow | TreasuryReconciliationRow | TreasuryReconciliationHistoryRow | TreasuryReconciliationRuleRow | TreasuryReconciliationStatementRow | TreasuryReconciliationPendingRow | TreasuryReconciliationPreviewRow | TreasuryExchangeDifferenceRow | TreasuryBankDebitTaxPolicyRow | TreasuryBankDebitTaxAssessmentRow | TreasuryPaymentExecutionRow | TreasuryBalanceRow | TreasuryReportRow;
/** Authorized cash-box projection. */
export interface TreasuryCashBoxRow { readonly rowKind: "cash_box"; readonly id: string; readonly code: string; readonly name: string; readonly currency: string; readonly status: string; readonly version: number; }
/** Company-owned bank master with stable ordering and revision. */
export interface TreasuryBankRow { readonly rowKind: "bank"; readonly id: string; readonly code: string; readonly name: string; readonly countryCode: string; readonly version: number; }
/** Masked bank instructions captured on a reusable company beneficiary. */
export interface TreasuryBeneficiaryBankDetailRow { readonly id: string; readonly bankId: string; readonly currency: string; readonly accountNumberMasked: string; readonly accountHolder: string; }
/** Company beneficiary with active state and safely projected settlement details. */
export interface TreasuryBeneficiaryRow { readonly rowKind: "beneficiary"; readonly id: string; readonly legalName: string; readonly taxIdentifier: string | null; readonly status: "active" | "inactive"; readonly version: number; readonly bankDetails: readonly TreasuryBeneficiaryBankDetailRow[]; }
/** Authorized bank-account projection with its number already masked. */
export interface TreasuryBankAccountRow { readonly rowKind: "bank_account"; readonly id: string; readonly bankId: string; readonly currency: string; readonly holderName: string; readonly accountNumberMasked: string; readonly status: string; readonly version: number; }
/** Immutable ledger projection. Exact amounts remain serialized strings. */
export interface TreasuryLedgerRow { readonly rowKind: "ledger_entry"; readonly id: string; readonly accountId: string; readonly accountKind: "cash_box" | "bank_account"; readonly direction: "credit" | "debit"; readonly amount: string; readonly currency: string; readonly movementType: string; readonly concept: string; readonly sourceType: string | null; readonly sourceId: string | null; readonly sourceLineId: string | null; readonly status: string; readonly operationalDate: string; readonly valueDate: string; readonly responsibleActorId: string | null; readonly version: number; }
/** Collection receipt whose unreserved remaining amount can participate in a grouped bank deposit. */
export interface TreasuryEligibleCollectionRow { readonly rowKind: "eligible_collection"; readonly collectionId: string; readonly receivableId: string; readonly receivedAmount: string; readonly reservedAmount: string; readonly availableAmount: string; readonly currency: string; readonly receivedAt: string; }
/** A serial-number range with its next available folio and concurrency version. */
export interface TreasuryCheckbookRow { readonly rowKind: "checkbook"; readonly id: string; readonly bankAccountId: string; readonly firstNumber: number; readonly lastNumber: number; readonly nextNumber: number; readonly status: "active" | "closed"; readonly version: number; }
/** Check projection including single monetary emission identity. */
export interface TreasuryCheckRow { readonly rowKind: "check"; readonly id: string; readonly bankAccountId: string; readonly number: string; readonly status: string; readonly amount: string; readonly currency: string; readonly issueDate: string; readonly version: number; }
/** Immutable delivery or undo event; it is not itself a check or monetary movement. */
export interface TreasuryCheckDeliveryRow { readonly rowKind: "check_delivery"; readonly id: string; readonly checkId: string; readonly eventType: string; readonly recipientName: string | null; readonly occurredAt: string; readonly reason: string | null; readonly evidenceReference: string | null; }
/** Deposit projection. */
export interface TreasuryDepositRow { readonly rowKind: "deposit"; readonly id: string; readonly destinationBankAccountId: string; readonly amount: string; readonly currency: string; readonly depositDate: string; readonly reference: string; }
/** Reconciliation link projection. */
export interface TreasuryReconciliationRow { readonly rowKind: "reconciliation"; readonly id: string; readonly bankAccountId: string; readonly state: "reconciled" | "statement_pending" | "ledger_pending" | "ambiguous"; readonly statementLineId: string | null; readonly ledgerEntryId: string | null; readonly matchType: "manual" | "automatic" | null; readonly ruleVersion: number | null; readonly reason: string; readonly createdAt: string; readonly createdBy: string; readonly version: number; }
/** Durable reconciliation event history; undo is represented without deleting the original match. */
export interface TreasuryReconciliationHistoryRow { readonly rowKind: "reconciliation_history"; readonly id: string; readonly bankAccountId: string; readonly statementLineId: string; readonly ledgerEntryId: string; readonly matchType: "manual" | "automatic"; readonly ruleSetId: string | null; readonly ruleVersion: number | null; readonly reason: string; readonly status: "active" | "undone"; readonly createdAt: string; readonly createdBy: string; readonly version: number; readonly undoneAt: string | null; readonly undoneBy: string | null; readonly undoReason: string | null; }
/** Versioned matching criteria with native-currency tolerance. */
export interface TreasuryReconciliationRuleRow { readonly rowKind: "reconciliation_rule"; readonly id: string; readonly bankAccountId: string; readonly activeFrom: LocalDate; readonly dateWindowDays: number; readonly toleranceAmount: string; readonly currency: string; readonly referenceWeight: string; readonly dateWeight: string; readonly version: number; readonly active: boolean; }
/** Imported statement cut with status, explanation and version required for safe closure. */
export interface TreasuryReconciliationStatementRow { readonly rowKind: "reconciliation_statement"; readonly id: string; readonly bankAccountId: string; readonly periodStart: LocalDate; readonly periodEnd: LocalDate; readonly externalReference: string; readonly status: "open" | "closed"; readonly version: number; readonly closedAt: string | null; readonly differenceExplanation: string | null; }
/** An unmatched statement line or ledger entry, retained separately from reconciliation matches. */
export interface TreasuryReconciliationPendingRow { readonly rowKind: "reconciliation_pending"; readonly state: "statement_pending" | "ledger_pending" | "ambiguous"; readonly itemKind: "statement_line" | "ledger_entry"; readonly id: string; readonly bankAccountId: string; readonly amount: string; readonly currency: string; readonly direction: "credit" | "debit"; readonly valueDate: string; readonly reference: string; readonly ageDays: number; readonly reason: string; readonly version: number; }
/** One deterministic statement-line outcome stored in a reconciliation preview. */
export type TreasuryReconciliationPreviewResult =
  | { readonly statementLineId: string; readonly state: "matched"; readonly ledgerEntryId: string; readonly score: number }
  | { readonly statementLineId: string; readonly state: "ambiguous"; readonly candidateLedgerEntryIds: readonly string[] }
  | { readonly statementLineId: string; readonly state: "unmatched"; readonly reason: "no_candidate" };
/** Stored evaluation result used to review and explicitly activate an automatic matching policy. */
export interface TreasuryReconciliationPreviewRow { readonly rowKind: "reconciliation_preview"; readonly id: string; readonly bankAccountId: string; readonly ruleSetId: string; readonly ruleVersion: number; readonly asOf: string; readonly results: readonly TreasuryReconciliationPreviewResult[]; readonly createdAt: string; }
/** Reproducible valuation adjustment linked to its native-currency source entry. */
export interface TreasuryExchangeDifferenceRow { readonly rowKind: "exchange_difference"; readonly id: string; readonly sourceEntryId: string; readonly bankAccountId: string; readonly differenceKind: "realized" | "unrealized"; readonly valuationDate: LocalDate; readonly nativeAmount: string; readonly currency: string; readonly priorVesAmount: string; readonly currentVesAmount: string; readonly differenceVesAmount: string; readonly priorRate: string; readonly currentRate: string; readonly priorPolicyVersion: string; readonly currentPolicyVersion: string; }
/** Approved temporal tax rate, legal basis, and version. */
export interface TreasuryBankDebitTaxPolicyRow { readonly rowKind: "bank_debit_tax_policy"; readonly id: string; readonly effectiveFrom: LocalDate; readonly effectiveTo: LocalDate | null; readonly ratePercent: string; readonly baseCurrency: string; readonly rounding: string; readonly legalBasis: string; readonly approvalReference: string; readonly subjectTypes: readonly string[]; readonly version: number; readonly active: boolean; }
/** Tax calculation linked to a posted debit and any authorized exclusion. */
export interface TreasuryBankDebitTaxAssessmentRow { readonly rowKind: "bank_debit_tax_assessment"; readonly id: string; readonly ledgerEntryId: string; readonly bankAccountId: string; readonly movementType: string; readonly concept: string; readonly operationalDate: LocalDate; readonly entryVersion: number; readonly policyId: string; readonly policyVersion: number; readonly ratePercent: string; readonly taxableAmount: string; readonly taxAmount: string; readonly currency: string; readonly exclusionId: string | null; readonly exclusionReason: string | null; readonly evidenceReference: string | null; }
/** Payment execution evidence linked to an administrative order without changing its lifecycle. */
export interface TreasuryPaymentExecutionRow { readonly rowKind: "payment_order_execution"; readonly paymentId: string; readonly paymentOrderId: string; readonly amount: string; readonly currency: string; readonly occurredOn: LocalDate; readonly ledgerEntryId: string; }
/** Balance report row returned by the SQL report projection. */
export interface TreasuryBalanceRow { readonly rowKind: "balance"; readonly accountId: string; readonly accountKind: "cash_box" | "bank_account"; readonly currency: string; readonly balance: string; }
/** Report row retains exact database scalar text and the selected report's column names. */
export interface TreasuryReportRow { readonly rowKind: "report"; readonly values: Readonly<Record<string, string | number | boolean | null>>; }
/** Authorized read-model persistence boundary. */
export interface TreasuryQueryRepository {
  /** @param scope - Authorized query scope. @param query - Validated filter or report request. @returns A stable page/snapshot value. @throws {TreasuryFailure} When access or persistence fails. */
  query(scope: TreasuryScope, query: TreasuryQuery): Promise<TreasuryPage<TreasuryReadRow>>;
}
/** Executes a validated authorized Treasury read query. */
export class ExecuteTreasuryQuery {
  /** @param repository - Durable authorized query boundary. */
  public constructor(private readonly repository: TreasuryQueryRepository) {}
  /** @param query - Complete query request. @returns An authorized stable page. @throws {TreasuryFailure} When validation or read persistence fails. */
  public async execute(query: TreasuryQuery): Promise<TreasuryPage<TreasuryReadRow>> {
    try { return await this.repository.query(query, validateTreasuryQuery(query)); }
    catch (cause: unknown) { if (cause instanceof TreasuryFailure) throw cause; throw new TreasuryFailure("UNAVAILABLE", "Treasury query repository is unavailable.", { cause }); }
  }
}
/** Validates portable query constraints before they reach persistence. */
export function validateTreasuryQuery(query: TreasuryQuery): TreasuryQuery {
  if (!isRecord(query) || typeof query.kind !== "string") throw new TreasuryFailure("INVALID", "Treasury query is invalid.");
  validateScope(query); if (!Number.isSafeInteger(query.page) || query.page < 1 || !Number.isSafeInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > (query.kind === "treasury_report" ? 10_000 : 500)) throw new TreasuryFailure("INVALID", "Treasury pagination is invalid.");
  switch (query.kind) {
    case "list_cash_boxes": optionalText(query.cashBoxId, "Cash-box identifier"); optionalCurrency(query.currency); optionalChoice(query.status, ["active", "inactive"], "Cash-box status"); break;
    case "list_banks": optionalSearch(query.search); break;
    case "list_beneficiaries": optionalChoice(query.status, ["active", "inactive"], "Beneficiary status"); optionalSearch(query.search); break;
    case "list_bank_accounts": optionalText(query.bankAccountId, "Bank-account identifier"); optionalText(query.bankId, "Bank identifier"); optionalCurrency(query.currency); optionalChoice(query.status, ["active", "inactive"], "Bank-account status"); break;
    case "get_balance": requireText(query.accountId, "Account identifier"); accountKind(query.accountKind); validateDate(query.asOf, "Balance date"); break;
    case "list_ledger_entries": requireText(query.accountId, "Account identifier"); accountKind(query.accountKind); period(query.from, query.to); optionalChoice(query.status, ["draft", "posted", "reversed"], "Ledger-entry status"); optionalChoice(query.movementType, ["cash_movement", "cash_income", "cash_expense", "bank_movement", "bank_debit", "bank_credit", "check_issue", "payment_order", "deposit", "reversal", "tax"], "Movement type"); optionalText(query.sourceType, "Source type"); optionalText(query.responsibleActorId, "Responsible actor identifier"); break;
    case "list_checks": optionalText(query.bankAccountId, "Bank account identifier"); optionalText(query.checkbookId, "Checkbook identifier"); optionalCheckNumber(query.number); optionalText(query.beneficiaryId, "Beneficiary identifier"); optionalPeriod(query.from, query.to); optionalChoice(query.status, ["issued", "delivered", "voided", "cleared"], "Check status"); break;
    case "list_checkbooks": optionalText(query.bankAccountId, "Bank account identifier"); optionalChoice(query.status, ["active", "closed"], "Checkbook status"); break;
    case "list_check_deliveries": optionalText(query.bankAccountId, "Bank account identifier"); optionalChoice(query.status, ["pending", "delivered", "undone"], "Check-delivery status"); break;
    case "list_deposits": optionalText(query.destinationBankAccountId, "Destination account identifier"); optionalPeriod(query.from, query.to); break;
    case "list_eligible_collections": optionalCurrency(query.currency); break;
    case "list_reconciliation_items": requireText(query.bankAccountId, "Bank account identifier"); optionalPeriod(query.from, query.to); optionalChoice(query.state, ["reconciled", "statement_pending", "ledger_pending", "ambiguous"], "Reconciliation state"); break;
    case "list_reconciliation_rules": requireText(query.bankAccountId, "Bank account identifier"); break;
    case "list_reconciliation_statements": requireText(query.bankAccountId, "Bank account identifier"); optionalChoice(query.status, ["open", "closed"], "Statement status"); break;
    case "get_reconciliation_preview": requireText(query.previewId, "Preview identifier"); break;
    case "list_reconciliation_history": requireText(query.bankAccountId, "Bank-account identifier"); optionalPeriod(query.from, query.to); break;
    case "list_bank_debit_tax_policies":
    case "list_bank_debit_tax_assessments": break;
    case "get_payment_order_execution": requireText(query.paymentOrderId, "Payment-order identifier"); break;
    case "list_exchange_differences": optionalText(query.bankAccountId, "Bank account identifier"); optionalPeriod(query.from, query.to); optionalChoice(query.differenceKind, ["realized", "unrealized"], "Exchange-difference classification"); break;
    case "treasury_report": optionalChoice(query.report, ["cash_ledger", "bank_ledger", "balances", "checks", "deposits", "payments", "reconciliation"], "Treasury report"); period(query.from, query.to); optionalText(query.accountId, "Account identifier"); optionalCurrency(query.currency); break;
    default: throw new TreasuryFailure("INVALID", "Treasury query kind is not supported.");
  }
  return query;
}
function period(from: LocalDate, to: LocalDate): void { validateDate(from, "Period start"); validateDate(to, "Period end"); if (from > to) throw new TreasuryFailure("INVALID", "Period start must not follow period end."); }
function optionalPeriod(from: LocalDate | undefined, to: LocalDate | undefined): void { if (from !== undefined && to !== undefined) period(from, to); else { if (from !== undefined) validateDate(from, "Period start"); if (to !== undefined) validateDate(to, "Period end"); } }
function optionalText(value: string | undefined, label: string): void { if (value !== undefined) requireText(value, label); }
function optionalSearch(value: string | undefined): void { if (value !== undefined && (typeof value !== "string" || !value.trim() || value.trim().length > 120)) throw new TreasuryFailure("INVALID", "Treasury search text is invalid."); }
function optionalCheckNumber(value: string | undefined): void { if (value !== undefined && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) throw new TreasuryFailure("INVALID", "Check number must be a positive safe integer."); }
function optionalCurrency(value: string | undefined): void { if (value !== undefined && !/^[A-Z]{3}$/.test(value)) throw new TreasuryFailure("INVALID", "Currency must be an uppercase ISO-style code."); }
function optionalChoice(value: string | undefined, choices: readonly string[], label: string): void { if (value !== undefined && !choices.includes(value)) throw new TreasuryFailure("INVALID", `${label} is invalid.`); }
function accountKind(value: unknown): asserts value is "cash_box" | "bank_account" { if (value !== "cash_box" && value !== "bank_account") throw new TreasuryFailure("INVALID", "Treasury account kind is invalid."); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
