import { requireText, treasuryMoney, treasuryTolerance, validateDate, validateScope, type LocalDate, type TreasuryDirection, type TreasuryMoney, type TreasuryScope, type TreasurySource, type TreasuryTolerance } from "../domain/model";
import { TreasuryFailure } from "../domain/failure";
import { addDecimal, compareDecimal, exactDecimal } from "@kontave/monetary/domain";

/** Concurrency and replay envelope required by every treasury write. */
export interface TreasuryCommandEnvelope extends TreasuryScope {
  readonly idempotencyKey: string;
  readonly correlationId: string;
}
/** Common persisted response to a treasury command. */
export interface TreasuryCommandResult {
  readonly commandId: string;
  readonly replayed: boolean;
  readonly affectedIds: readonly string[];
  readonly versions: Readonly<Record<string, number>>;
}
/** A reference to a cash box or bank account that owns a ledger balance. */
export interface TreasuryAccountRef { readonly kind: "cash_box" | "bank_account"; readonly id: string; readonly currency: string; }
/** The full command language accepted by the atomic Treasury persistence boundary. */
export type TreasuryWriteCommand =
  | CreateCashBoxCommand | CreateBankCommand | CreateBankAccountCommand | CreateBeneficiaryCommand
  | CreateLedgerDraftCommand | PostLedgerDraftCommand | PostLedgerEntryCommand | ReverseLedgerEntryCommand | CreateCheckbookCommand | IssueCheckCommand
  | RecordCheckDeliveryCommand | UndoCheckDeliveryCommand | CreateDepositCommand | ExecutePaymentOrderCommand
  | ImportBankStatementCommand | ConfigureReconciliationCommand | PreviewReconciliationRuleCommand | ActivateReconciliationRuleCommand | ReconcileManuallyCommand | UndoReconciliationMatchCommand
  | RunAutomaticReconciliationCommand | CloseReconciliationCommand | RecordForeignExchangeDifferenceCommand
  | ConfigureBankDebitTaxPolicyCommand | ExcludeBankDebitTaxOperationCommand;

/** TES-001 creates one cash box. */
export interface CreateCashBoxCommand extends TreasuryCommandEnvelope { readonly kind: "create_cash_box"; readonly cashBoxId: string; readonly code: string; readonly name: string; readonly currency: string; readonly responsibleActorId: string; }
/** TES-003 creates a bank master. */
export interface CreateBankCommand extends TreasuryCommandEnvelope { readonly kind: "create_bank"; readonly bankId: string; readonly code: string; readonly name: string; readonly countryCode: string; }
/** TES-004 creates a company bank account. */
export interface CreateBankAccountCommand extends TreasuryCommandEnvelope { readonly kind: "create_bank_account"; readonly bankAccountId: string; readonly bankId: string; readonly currency: string; readonly holderName: string; readonly accountNumber: string; readonly allowOverdraft: boolean; }
/** TES-027 creates a reusable beneficiary master. */
export interface CreateBeneficiaryCommand extends TreasuryCommandEnvelope { readonly kind: "create_beneficiary"; readonly beneficiaryId: string; readonly legalName: string; readonly taxIdentifier?: string; readonly bankDetails?: readonly BeneficiaryBankDetail[]; }
/** Beneficiary settlement data captured independently from historical payment snapshots. */
export interface BeneficiaryBankDetail { readonly id: string; readonly bankId: string; readonly currency: string; readonly accountNumber: string; readonly accountHolder: string; }
/** TES-008 through TES-013 post a signed financial fact once. */
export interface PostLedgerEntryCommand extends TreasuryCommandEnvelope { readonly kind: "post_ledger_entry"; readonly entryId: string; readonly account: TreasuryAccountRef; readonly direction: TreasuryDirection; readonly money: TreasuryMoney; readonly operationalDate: LocalDate; readonly valueDate: LocalDate; readonly concept: string; readonly source?: TreasurySource; readonly expectedAccountVersion: number; readonly movementType: "cash_movement" | "cash_income" | "cash_expense" | "bank_movement" | "bank_debit" | "bank_credit"; }
/** TES-008 stores a nonfinancial draft which cannot affect balance or source claims. */
export interface CreateLedgerDraftCommand extends TreasuryCommandEnvelope { readonly kind: "create_ledger_draft"; readonly entryId: string; readonly account: TreasuryAccountRef; readonly direction: TreasuryDirection; readonly money: TreasuryMoney; readonly operationalDate: LocalDate; readonly valueDate: LocalDate; readonly concept: string; readonly source?: TreasurySource; readonly movementType: PostLedgerEntryCommand["movementType"]; }
/** Posts one versioned draft and creates its first immutable balance effect. */
export interface PostLedgerDraftCommand extends TreasuryCommandEnvelope { readonly kind: "post_ledger_draft"; readonly entryId: string; readonly expectedVersion: number; readonly expectedAccountVersion: number; }
/** Reverses a posted ledger fact through a compensating immutable entry. */
export interface ReverseLedgerEntryCommand extends TreasuryCommandEnvelope { readonly kind: "reverse_ledger_entry"; readonly reversalEntryId: string; readonly entryId: string; readonly reason: string; readonly operationalDate: LocalDate; readonly valueDate: LocalDate; readonly expectedVersion: number; }
/** TES-015 creates a nonoverlapping numbered checkbook. */
export interface CreateCheckbookCommand extends TreasuryCommandEnvelope { readonly kind: "create_checkbook"; readonly checkbookId: string; readonly bankAccountId: string; readonly firstNumber: number; readonly lastNumber: number; }
/** TES-014/017 issue a check and post its cash effect exactly once. */
export interface IssueCheckCommand extends TreasuryCommandEnvelope { readonly kind: "issue_check"; readonly checkId: string; readonly checkbookId: string; readonly bankAccountId: string; readonly number: number; readonly beneficiaryId: string; readonly beneficiarySnapshot: string; readonly money: TreasuryMoney; readonly issueDate: LocalDate; readonly concept: string; readonly expectedCheckbookVersion: number; readonly expectedBankAccountVersion: number; }
/** TES-018 records delivery metadata without a second ledger effect. */
export interface RecordCheckDeliveryCommand extends TreasuryCommandEnvelope { readonly kind: "record_check_delivery"; readonly deliveryEventId: string; readonly checkId: string; readonly recipientName: string; readonly deliveredAt: string; readonly evidenceReference?: string; readonly expectedVersion: number; }
/** TES-019 compensates a delivery record while preserving its history. */
export interface UndoCheckDeliveryCommand extends TreasuryCommandEnvelope { readonly kind: "undo_check_delivery"; readonly deliveryEventId: string; readonly checkId: string; readonly reason: string; readonly expectedVersion: number; }
/** TES-021 and TES-022 move reserved collections into a destination bank account. */
export interface CreateDepositCommand extends TreasuryCommandEnvelope { readonly kind: "create_deposit"; readonly depositId: string; readonly destinationBankAccountId: string; readonly sourceAccount?: TreasuryAccountRef; readonly expectedSourceVersion?: number; readonly money: TreasuryMoney; readonly depositDate: LocalDate; readonly reference: string; readonly collectionAllocations?: readonly CollectionAllocation[]; readonly expectedDestinationVersion: number; }
/** A sale collection is only referenced and reserved; Sales owns its receivable balance. */
export interface CollectionAllocation { readonly collectionId: string; readonly amount: TreasuryMoney; }
/** TES-026 settles one still-eligible payment order through one treasury instrument. */
export interface ExecutePaymentOrderCommand extends TreasuryCommandEnvelope { readonly kind: "execute_payment_order"; readonly paymentId: string; readonly paymentOrderId: string; readonly beneficiaryId: string; readonly account: TreasuryAccountRef; readonly money: TreasuryMoney; readonly operationalDate: LocalDate; readonly valueDate: LocalDate; readonly method: "cash" | "bank_debit" | "check"; readonly instrumentId?: string; readonly expectedAccountVersion: number; }
/** TES-028 imports an external bank statement and preserves external source identity. */
export interface ImportBankStatementCommand extends TreasuryCommandEnvelope { readonly kind: "import_bank_statement"; readonly statementId: string; readonly bankAccountId: string; readonly periodStart: LocalDate; readonly periodEnd: LocalDate; readonly externalReference: string; readonly lines: readonly BankStatementLineInput[]; }
/** A normalized statement row. The adapter maps a bank-specific file to this neutral shape. */
export interface BankStatementLineInput { readonly lineId: string; readonly externalId: string; readonly valueDate: LocalDate; readonly direction: TreasuryDirection; readonly money: TreasuryMoney; readonly reference: string; readonly description: string; }
/** TES-030 saves a versioned automatic matching policy. */
export interface ConfigureReconciliationCommand extends TreasuryCommandEnvelope { readonly kind: "configure_reconciliation"; readonly ruleSetId: string; readonly bankAccountId: string; readonly expectedVersion: number; readonly activeFrom: LocalDate; readonly dateWindowDays: number; readonly amountTolerance: TreasuryTolerance; readonly referenceWeight: number; readonly dateWeight: number; }
/** TES-030 snapshots deterministic candidate decisions for an inactive rule version without creating matches. */
export interface PreviewReconciliationRuleCommand extends TreasuryCommandEnvelope { readonly kind: "preview_reconciliation_rule"; readonly previewId: string; readonly ruleSetId: string; readonly ruleVersion: number; readonly bankAccountId: string; readonly asOf: LocalDate; }
/** TES-030 activates only the exact rule version with a durable preview. */
export interface ActivateReconciliationRuleCommand extends TreasuryCommandEnvelope { readonly kind: "activate_reconciliation_rule"; readonly ruleSetId: string; readonly ruleVersion: number; readonly bankAccountId: string; readonly previewId: string; }
/** TES-028 creates a versioned explicit statement-to-ledger match. */
export interface ReconcileManuallyCommand extends TreasuryCommandEnvelope { readonly kind: "reconcile_manually"; readonly matchId: string; readonly bankAccountId: string; readonly statementLineId: string; readonly ledgerEntryId: string; readonly expectedStatementLineVersion: number; readonly expectedLedgerEntryVersion: number; readonly reason: string; }
/** TES-031 records a versioned compensating event for one active statement-to-ledger link. */
export interface UndoReconciliationMatchCommand extends TreasuryCommandEnvelope { readonly kind: "undo_reconciliation_match"; readonly matchId: string; readonly reason: string; readonly expectedVersion: number; }
/** TES-029 evaluates one deterministic active ruleset; ambiguous candidates remain pending. */
export interface RunAutomaticReconciliationCommand extends TreasuryCommandEnvelope { readonly kind: "run_automatic_reconciliation"; readonly runId: string; readonly bankAccountId: string; readonly ruleSetId: string; readonly asOf: LocalDate; }
/** Closes one reconciliation cut after every difference has a durable explanation. */
export interface CloseReconciliationCommand extends TreasuryCommandEnvelope { readonly kind: "close_reconciliation"; readonly closeId: string; readonly bankAccountId: string; readonly statementId: string; readonly expectedStatementVersion: number; readonly closedAt: string; readonly differenceExplanation?: string; }
/** TES-033 records a separate, replay-safe foreign-exchange revaluation adjustment. */
export interface RecordForeignExchangeDifferenceCommand extends TreasuryCommandEnvelope { readonly kind: "record_foreign_exchange_difference"; readonly adjustmentId: string; readonly bankAccountId: string; readonly valuationDate: LocalDate; readonly differenceKind: "realized" | "unrealized"; readonly priorOperationalValue: TreasuryMoney; readonly currentOperationalValue: TreasuryMoney; readonly sourceEntryId: string; readonly expectedAccountVersion: number; }
/** TES-034 configures an approved temporal bank-debit tax policy; SQL calculates the charge. */
export interface ConfigureBankDebitTaxPolicyCommand extends TreasuryCommandEnvelope { readonly kind: "configure_bank_debit_tax_policy"; readonly policyId: string; readonly expectedVersion: number; readonly effectiveFrom: LocalDate; readonly effectiveTo?: LocalDate; readonly ratePercent: string; readonly baseCurrency: string; readonly rounding: string; readonly legalBasis: string; readonly approvalReference: string; readonly subjectTypes: readonly string[]; }
/** TES-035 records an authorized, evidenced exclusion before a debit tax is determined. */
export interface ExcludeBankDebitTaxOperationCommand extends TreasuryCommandEnvelope { readonly kind: "exclude_bank_debit_tax_operation"; readonly exclusionId: string; readonly ledgerEntryId: string; readonly reason: string; readonly evidenceReference: string; readonly expectedEntryVersion: number; }

/** Validates business data before a command crosses into atomic persistence. */
export function validateTreasuryCommand(command: TreasuryWriteCommand): TreasuryWriteCommand {
  if (!isRecord(command) || typeof command.kind !== "string") throw new TreasuryFailure("INVALID", "Treasury command is invalid.");
  validateScope(command); requireText(command.idempotencyKey, "Idempotency key", 256); requireText(command.correlationId, "Correlation identifier", 256);
  switch (command.kind) {
    case "create_cash_box": requireText(command.cashBoxId, "Cash box identifier"); requireText(command.code, "Cash box code"); requireText(command.name, "Cash box name"); requireCurrency(command.currency); requireText(command.responsibleActorId, "Responsible actor"); break;
    case "create_bank": requireText(command.bankId, "Bank identifier"); requireText(command.code, "Bank code"); requireText(command.name, "Bank name"); if (!/^[A-Z]{2}$/.test(command.countryCode)) throw new TreasuryFailure("INVALID", "Bank country code is invalid."); break;
    case "create_bank_account": requireText(command.bankAccountId, "Bank account identifier"); requireText(command.bankId, "Bank identifier"); requireCurrency(command.currency); requireText(command.holderName, "Account holder"); requireText(command.accountNumber, "Account number"); if (typeof command.allowOverdraft !== "boolean") throw new TreasuryFailure("INVALID", "Overdraft policy must be explicit."); break;
    case "create_beneficiary": requireText(command.beneficiaryId, "Beneficiary identifier"); requireText(command.legalName, "Beneficiary name"); if (command.bankDetails !== undefined && !Array.isArray(command.bankDetails)) throw new TreasuryFailure("INVALID", "Beneficiary bank details are invalid."); command.bankDetails?.forEach(validateBankDetail); break;
    case "post_ledger_entry": validatePost(command); break;
    case "create_ledger_draft": validateDraft(command); break;
    case "post_ledger_draft": requireText(command.entryId, "Ledger entry identifier"); version(command.expectedVersion); version(command.expectedAccountVersion); break;
    case "reverse_ledger_entry": requireText(command.reversalEntryId, "Reversal identifier"); requireText(command.entryId, "Ledger entry identifier"); requireText(command.reason, "Reversal reason"); validateDate(command.operationalDate, "Reversal operational date"); validateDate(command.valueDate, "Reversal value date"); version(command.expectedVersion); break;
    case "create_checkbook": requireText(command.checkbookId, "Checkbook identifier"); requireText(command.bankAccountId, "Bank account identifier"); range(command.firstNumber, command.lastNumber); break;
    case "issue_check": requireText(command.checkId, "Check identifier"); requireText(command.checkbookId, "Checkbook identifier"); requireText(command.bankAccountId, "Bank account identifier"); requireText(command.beneficiaryId, "Beneficiary identifier"); requireText(command.beneficiarySnapshot, "Beneficiary snapshot"); positiveInteger(command.number, "Check number"); treasuryMoney(command.money); validateDate(command.issueDate, "Issue date"); requireText(command.concept, "Check concept"); version(command.expectedCheckbookVersion); version(command.expectedBankAccountVersion); break;
    case "record_check_delivery": requireText(command.deliveryEventId, "Delivery event identifier"); requireText(command.checkId, "Check identifier"); requireText(command.recipientName, "Recipient"); requireText(command.deliveredAt, "Delivery timestamp"); version(command.expectedVersion); break;
    case "undo_check_delivery": requireText(command.deliveryEventId, "Delivery event identifier"); requireText(command.checkId, "Check identifier"); requireText(command.reason, "Undo reason"); version(command.expectedVersion); break;
    case "create_deposit": validateDeposit(command); break;
    case "execute_payment_order": validatePayment(command); break;
    case "import_bank_statement": validateStatement(command); break;
    case "configure_reconciliation": validateRule(command); break;
    case "preview_reconciliation_rule": requireText(command.previewId, "Preview identifier"); requireText(command.ruleSetId, "Rule-set identifier"); requireText(command.bankAccountId, "Bank account identifier"); positiveInteger(command.ruleVersion, "Rule version"); validateDate(command.asOf, "Preview date"); break;
    case "activate_reconciliation_rule": requireText(command.ruleSetId, "Rule-set identifier"); requireText(command.bankAccountId, "Bank account identifier"); requireText(command.previewId, "Preview identifier"); positiveInteger(command.ruleVersion, "Rule version"); break;
    case "reconcile_manually": requireText(command.matchId, "Match identifier"); requireText(command.bankAccountId, "Bank account identifier"); requireText(command.statementLineId, "Statement-line identifier"); requireText(command.ledgerEntryId, "Ledger entry identifier"); requireText(command.reason, "Reconciliation reason"); version(command.expectedStatementLineVersion); version(command.expectedLedgerEntryVersion); break;
    case "undo_reconciliation_match": requireText(command.matchId, "Match identifier"); requireText(command.reason, "Undo reason"); version(command.expectedVersion); break;
    case "run_automatic_reconciliation": requireText(command.runId, "Run identifier"); requireText(command.bankAccountId, "Bank account identifier"); requireText(command.ruleSetId, "Rule-set identifier"); validateDate(command.asOf, "Reconciliation date"); break;
    case "close_reconciliation": requireText(command.closeId, "Reconciliation close identifier"); requireText(command.bankAccountId, "Bank account identifier"); requireText(command.statementId, "Statement identifier"); requireText(command.closedAt, "Reconciliation close timestamp"); version(command.expectedStatementVersion); break;
    case "record_foreign_exchange_difference": requireText(command.adjustmentId, "Adjustment identifier"); requireText(command.bankAccountId, "Bank account identifier"); requireText(command.sourceEntryId, "Source entry identifier"); validateDate(command.valuationDate, "Valuation date"); if (command.differenceKind !== "realized" && command.differenceKind !== "unrealized") throw new TreasuryFailure("INVALID", "Exchange difference classification is invalid."); treasuryMoney(command.priorOperationalValue); treasuryMoney(command.currentOperationalValue); version(command.expectedAccountVersion); break;
    case "configure_bank_debit_tax_policy": requireText(command.policyId, "Tax policy identifier"); if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) throw new TreasuryFailure("INVALID", "Expected tax policy version is invalid."); validateDate(command.effectiveFrom, "Tax policy effective start"); if (command.effectiveTo !== undefined) validateDate(command.effectiveTo, "Tax policy effective end"); if (command.effectiveTo !== undefined && command.effectiveTo < command.effectiveFrom) throw new TreasuryFailure("INVALID", "Tax policy effective range is invalid."); if (compareDecimal(decimalRate(command.ratePercent), exactDecimal("0")) < 0) throw new TreasuryFailure("INVALID", "Tax policy rate cannot be negative."); requireCurrency(command.baseCurrency); if (command.rounding !== "half_up") throw new TreasuryFailure("INVALID", "Treasury tax persistence supports half-up rounding only."); requireText(command.legalBasis, "Tax policy legal basis"); requireText(command.approvalReference, "Tax policy approval"); if (!Array.isArray(command.subjectTypes) || !command.subjectTypes.length || command.subjectTypes.some(subject => subject !== "bank_debit" && subject !== "check_issue") || new Set(command.subjectTypes).size !== command.subjectTypes.length) throw new TreasuryFailure("INVALID", "Tax policy subjects must be unique supported bank-debit operations."); break;
    case "exclude_bank_debit_tax_operation": requireText(command.exclusionId, "Tax exclusion identifier"); requireText(command.ledgerEntryId, "Ledger entry identifier"); requireText(command.reason, "Tax exclusion reason"); requireText(command.evidenceReference, "Tax exclusion evidence"); version(command.expectedEntryVersion); break;
    default: throw new TreasuryFailure("INVALID", "Treasury command kind is not supported.");
  }
  return command;
}
function validatePost(command: PostLedgerEntryCommand): void { requireText(command.entryId, "Ledger entry identifier"); treasuryMoney(command.money); validateAccount(command.account, command.money); validateDirection(command.direction); validateMovementType(command.movementType); optionalSource(command.source); validateDate(command.operationalDate, "Operational date"); validateDate(command.valueDate, "Value date"); requireText(command.concept, "Concept"); version(command.expectedAccountVersion); }
function validateDraft(command: CreateLedgerDraftCommand): void { requireText(command.entryId, "Ledger entry identifier"); treasuryMoney(command.money); validateAccount(command.account, command.money); validateDirection(command.direction); validateMovementType(command.movementType); optionalSource(command.source); validateDate(command.operationalDate, "Operational date"); validateDate(command.valueDate, "Value date"); requireText(command.concept, "Concept"); }
function validateDeposit(command: CreateDepositCommand): void {
  requireText(command.depositId, "Deposit identifier"); requireText(command.destinationBankAccountId, "Destination account identifier"); treasuryMoney(command.money); validateDate(command.depositDate, "Deposit date"); requireText(command.reference, "Deposit reference"); version(command.expectedDestinationVersion);
  if (command.collectionAllocations !== undefined && !Array.isArray(command.collectionAllocations)) throw new TreasuryFailure("INVALID", "Deposit collection allocations are invalid.");
  const allocations = command.collectionAllocations ?? [];
  if ((command.sourceAccount === undefined) === (allocations.length === 0)) throw new TreasuryFailure("INVALID", "A deposit must have exactly one source: an account transfer or collection allocations.");
  const collectionIds = new Set<string>(); let allocatedAmount = exactDecimal("0");
  for (const allocation of allocations) {
    if (!isRecord(allocation)) throw new TreasuryFailure("INVALID", "Deposit collection allocation is invalid.");
    const normalized = allocation as unknown as CollectionAllocation;
    requireText(normalized.collectionId, "Collection identifier"); treasuryMoney(normalized.amount);
    if (collectionIds.has(normalized.collectionId)) throw new TreasuryFailure("INVALID", "Collection allocations must not repeat a payment.");
    if (normalized.amount.currency !== command.money.currency) throw new TreasuryFailure("INVALID", "Collection allocations must use the deposit currency.");
    collectionIds.add(normalized.collectionId); allocatedAmount = addDecimal(allocatedAmount, normalized.amount.amount);
  }
  if (allocations.length > 0 && compareDecimal(allocatedAmount, command.money.amount) !== 0) throw new TreasuryFailure("INVALID", "Collection allocations must equal the deposit amount.");
  if (command.sourceAccount) { validateAccount(command.sourceAccount, command.money); version(command.expectedSourceVersion ?? 0); }
  else if (command.expectedSourceVersion !== undefined) throw new TreasuryFailure("INVALID", "A source-account version requires a source account.");
}
function validatePayment(command: ExecutePaymentOrderCommand): void { requireText(command.paymentId, "Payment identifier"); requireText(command.paymentOrderId, "Payment order identifier"); requireText(command.beneficiaryId, "Beneficiary identifier"); treasuryMoney(command.money); validateAccount(command.account, command.money); if ("taxableBankDebit" in command || !["cash", "bank_debit", "check"].includes(command.method)) throw new TreasuryFailure("INVALID", "Payment method or deprecated client tax classification is invalid."); if ((command.method === "cash") !== (command.account.kind === "cash_box")) throw new TreasuryFailure("INVALID", "Payment method does not match its treasury account."); optionalText(command.instrumentId, "Payment instrument identifier"); validateDate(command.operationalDate, "Operational date"); validateDate(command.valueDate, "Value date"); version(command.expectedAccountVersion); }
function validateAccount(account: TreasuryAccountRef, money: TreasuryMoney): void { if (!isRecord(account) || (account.kind !== "cash_box" && account.kind !== "bank_account")) throw new TreasuryFailure("INVALID", "Treasury account reference is invalid."); if (!isRecord(money) || typeof money.currency !== "string") throw new TreasuryFailure("INVALID", "Treasury movement money is invalid."); requireText(account.id, "Account identifier"); requireCurrency(account.currency); if (account.currency !== money.currency) throw new TreasuryFailure("INVALID", "Treasury account and movement currency must match."); }
function validateStatement(command: ImportBankStatementCommand): void {
  requireText(command.statementId, "Statement identifier");
  requireText(command.bankAccountId, "Bank account identifier");
  validateDate(command.periodStart, "Statement start");
  validateDate(command.periodEnd, "Statement end");
  if (command.periodEnd < command.periodStart) throw new TreasuryFailure("INVALID", "Statement end must not precede its start.");
  requireText(command.externalReference, "Statement external reference");
  if (!Array.isArray(command.lines) || !command.lines.length) throw new TreasuryFailure("INVALID", "A statement requires at least one valid line.");
  const lineIds = new Set<string>();
  const externalIds = new Set<string>();
  command.lines.forEach(rawLine => {
    if (!isRecord(rawLine)) throw new TreasuryFailure("INVALID", "Statement line is invalid.");
    const line = rawLine as unknown as BankStatementLineInput;
    requireText(line.lineId, "Statement-line identifier");
    requireText(line.externalId, "Statement-line external identifier");
    if (lineIds.has(line.lineId) || externalIds.has(line.externalId)) throw new TreasuryFailure("INVALID", "Statement line identifiers must be unique within the import.");
    lineIds.add(line.lineId);
    externalIds.add(line.externalId);
    validateDate(line.valueDate, "Statement-line value date");
    if (line.valueDate < command.periodStart || line.valueDate > command.periodEnd) throw new TreasuryFailure("INVALID", "Statement-line value date must be inside the statement period.");
    validateDirection(line.direction);
    treasuryMoney(line.money);
    requireText(line.reference, "Statement-line reference");
    requireText(line.description, "Statement-line description");
  });
}
function validateRule(command: ConfigureReconciliationCommand): void { requireText(command.ruleSetId, "Rule-set identifier"); requireText(command.bankAccountId, "Bank account identifier"); validateDate(command.activeFrom, "Rule activation date"); if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) throw new TreasuryFailure("INVALID", "Expected rule-set version is invalid."); treasuryTolerance(command.amountTolerance); if (!Number.isInteger(command.dateWindowDays) || command.dateWindowDays < 0 || command.dateWindowDays > 365) throw new TreasuryFailure("INVALID", "Reconciliation date window is invalid."); if (!Number.isFinite(command.referenceWeight) || !Number.isFinite(command.dateWeight) || command.referenceWeight < 0 || command.dateWeight < 0 || command.referenceWeight + command.dateWeight <= 0) throw new TreasuryFailure("INVALID", "Reconciliation weights are invalid."); }
function validateBankDetail(detail: BeneficiaryBankDetail): void { if (!isRecord(detail)) throw new TreasuryFailure("INVALID", "Beneficiary bank detail is invalid."); requireText(detail.id, "Beneficiary bank-detail identifier"); requireText(detail.bankId, "Bank identifier"); requireCurrency(detail.currency); requireText(detail.accountNumber, "Beneficiary account number"); requireText(detail.accountHolder, "Beneficiary account holder"); }
function optionalSource(source: TreasurySource | undefined): void { if (source === undefined) return; if (!isRecord(source)) throw new TreasuryFailure("INVALID", "Treasury source is invalid."); requireText(source.type, "Source type"); requireText(source.id, "Source identifier"); optionalText(source.lineId, "Source line identifier"); }
function optionalText(value: string | undefined, label: string): void { if (value !== undefined) requireText(value, label); }
function validateDirection(value: unknown): asserts value is TreasuryDirection { if (value !== "credit" && value !== "debit") throw new TreasuryFailure("INVALID", "Treasury movement direction is invalid."); }
function validateMovementType(value: unknown): asserts value is PostLedgerEntryCommand["movementType"] { if (!new Set(["cash_movement", "cash_income", "cash_expense", "bank_movement", "bank_debit", "bank_credit"]).has(value as string)) throw new TreasuryFailure("INVALID", "Treasury movement type is invalid."); }
function decimalRate(value: unknown): ReturnType<typeof exactDecimal> { if (typeof value !== "string") throw new TreasuryFailure("INVALID", "Tax policy rate must be decimal text."); try { return exactDecimal(value); } catch (cause: unknown) { throw new TreasuryFailure("INVALID", "Tax policy rate is invalid.", cause instanceof Error ? { cause } : undefined); } }
function requireCurrency(value: string): void { if (!/^[A-Z]{3}$/.test(value)) throw new TreasuryFailure("INVALID", "Currency must be an uppercase ISO-style code."); }
function version(value: number): void { if (!Number.isSafeInteger(value) || value < 1) throw new TreasuryFailure("INVALID", "Expected version is invalid."); }
function positiveInteger(value: number, label: string): void { if (!Number.isSafeInteger(value) || value < 1) throw new TreasuryFailure("INVALID", `${label} is invalid.`); }
function range(first: number, last: number): void { positiveInteger(first, "First check number"); positiveInteger(last, "Last check number"); if (last < first || last >= Number.MAX_SAFE_INTEGER) throw new TreasuryFailure("INVALID", "Checkbook range is invalid."); }

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
