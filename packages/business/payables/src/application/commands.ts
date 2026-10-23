import type { DueDateChange, PayableDocument, PayablesScope } from "../domain/model";

/** Envelope shared by idempotent Accounts Payable commands. */
export interface PayablesCommandEnvelope extends PayablesScope {
  readonly idempotencyKey: string;
  readonly correlationId: string;
}
/** Creates a non-fiscal supplier obligation manually. */
export interface CreateManualPayableCommand extends PayablesCommandEnvelope {
  readonly kind: "create_manual_document";
  readonly documentId: string;
  readonly supplierId: string;
  readonly documentNumber: string;
  readonly concept: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly currency: string;
  readonly principal: string;
  readonly rateSnapshot: {
    readonly amount: string;
    readonly baseCurrency: "VES";
    readonly rate: string;
    readonly source: string;
    readonly effectiveDate: string;
    readonly policyVersion: string;
    readonly rounding: "half_up";
  };
}
/** Changes a due date while preserving its reason and version history. */
export interface ChangePayableDueDateCommand extends PayablesCommandEnvelope {
  readonly kind: "change_due_date";
  readonly changeId: string;
  readonly documentId: string;
  readonly dueAt: string;
  readonly reason: string;
  readonly expectedVersion: number;
}
/** Creates a supplier and currency scoped payment batch. */
export interface CreatePaymentBatchCommand extends PayablesCommandEnvelope { readonly kind: "create_payment_batch"; readonly batchId: string; readonly supplierId: string; readonly plannedDate: string; readonly currency: string; }
/** Reserves or revises one document amount in a draft payment batch. */
export interface SetPaymentBatchItemCommand extends PayablesCommandEnvelope { readonly kind: "set_payment_batch_item"; readonly batchId: string; readonly itemId: string; readonly documentId: string; readonly amount: string; readonly expectedVersion: number; }
/** Submits a populated draft batch for authorization. */
export interface SubmitPaymentBatchCommand extends PayablesCommandEnvelope { readonly kind: "submit_payment_batch"; readonly batchId: string; readonly expectedVersion: number; }
/** Authorizes or rejects a submitted batch under the configured separation rule. */
export interface DecidePaymentBatchCommand extends PayablesCommandEnvelope { readonly kind: "authorize_payment_batch"; readonly batchId: string; readonly expectedVersion: number; readonly decision: "authorized" | "rejected"; readonly reason?: string; readonly separationRequired: boolean; }
/** Loads one pre-go-live supplier balance as a document without fiscal or accounting effect. */
export interface ImportOpeningPayableCommand extends Omit<CreateManualPayableCommand, "kind"> {
  readonly kind: "import_opening_document";
  /** Reference to the supporting evidence, such as the supplier statement used for the cut-over. */
  readonly evidence: string;
}
/** Records a non-fiscal positive (more debt) or negative (credit) adjustment. */
export interface CreatePayableAdjustmentCommand extends Omit<CreateManualPayableCommand, "kind" | "dueAt"> {
  readonly kind: "create_adjustment";
  readonly direction: "positive" | "negative";
  readonly reason: string;
  /** Required for positive adjustments; a negative adjustment is available on its issue date. */
  readonly dueAt?: string;
  readonly parentDocumentId?: string;
}
/** One amount of a credit applied to one open debit document. */
export interface PayableCreditAllocation { readonly applicationId: string; readonly documentId: string; readonly amount: string; }
/** Applies an open credit note or negative adjustment to one or more debts of the same supplier and currency. */
export interface ApplyPayableCreditCommand extends PayablesCommandEnvelope { readonly kind: "apply_credit"; readonly creditDocumentId: string; readonly occurredAt: string; readonly allocations: readonly PayableCreditAllocation[]; }
/** Reverses one manual credit application with a compensating fact. */
export interface ReversePayableCreditApplicationCommand extends PayablesCommandEnvelope { readonly kind: "reverse_credit_application"; readonly applicationId: string; readonly reason: string; }
/** One installment (giro) created from a document balance. */
export interface PayableInstallmentInput { readonly documentId: string; readonly amount: string; readonly dueAt: string; }
/** Transfers a document's whole open balance into installments that sum to it exactly. */
export interface CreateInstallmentPlanCommand extends PayablesCommandEnvelope { readonly kind: "create_installment_plan"; readonly planId: string; readonly documentId: string; readonly expectedVersion: number; readonly installments: readonly PayableInstallmentInput[]; }
/** Undoes an installment plan whose installments have no applications or reservations. */
export interface UndoInstallmentPlanCommand extends PayablesCommandEnvelope { readonly kind: "undo_installment_plan"; readonly planId: string; readonly expectedVersion: number; readonly reason: string; }
/** Treasury account debited by a supplier payment. */
export interface PayablesTreasuryAccount { readonly kind: "cash_box" | "bank_account"; readonly id: string; }
/** Native payment money with its server-resolved VES valuation, in Treasury's wire shape. */
export interface PayablesMoney {
  readonly amount: string;
  readonly currency: string;
  readonly operationalValue: { readonly baseCurrency: "VES"; readonly amount: string; readonly rate: string; readonly source: string; readonly asOf: string; readonly policyVersion: string; readonly rounding: "half_up" };
}
/** One payment amount, in payment currency, applied to one open debt. */
export interface PayablesPaymentLine { readonly lineId: string; readonly documentId: string; readonly amount: string; }
/** A withholding issued when the payment is the first event (decision 6). */
export interface PayablesWithholdingInput {
  readonly id: string;
  readonly documentId: string;
  readonly kind: "vat" | "islr";
  /** VAT: the document's IVA in VES. ISLR: the taxable base in VES. */
  readonly taxableBaseVes?: string;
  /** VAT: 75 or 100. ISLR: resolved on the server from the concept catalog. */
  readonly rate?: string;
  readonly subtrahendVes?: string;
  readonly conceptCode?: string;
  readonly taxUnitValue?: string;
}
/** Shared facts of a disbursement, valued on the server before persistence. */
interface PayablesDisbursementFacts {
  readonly method: "cash" | "transfer" | "check";
  readonly account: PayablesTreasuryAccount;
  readonly checkbookId?: string;
  readonly reference?: string;
  readonly concept?: string;
  readonly occurredAt: string;
  readonly money: PayablesMoney;
  /** Debt currencies other than the payment currency; the server values each at the payment date. */
  readonly debtCurrencies?: readonly string[];
  readonly rates?: Readonly<Record<string, { readonly rate: string; readonly source: string }>>;
  readonly withholdings?: readonly PayablesWithholdingInput[];
}
/** Pays one or more documents of one supplier in one Treasury transaction (CXP-016-023). */
export interface ExecuteSupplierPaymentCommand extends PayablesCommandEnvelope, PayablesDisbursementFacts { readonly kind: "execute_supplier_payment"; readonly paymentId: string; readonly supplierId: string; readonly lines: readonly PayablesPaymentLine[]; }
/** Pays an authorized batch's reserved items exactly once. */
export interface ExecutePaymentBatchCommand extends PayablesCommandEnvelope, PayablesDisbursementFacts { readonly kind: "execute_payment_batch"; readonly batchId: string; readonly expectedVersion: number; readonly paymentId?: string; }
/** Voids an unreconciled payment of an open period on its own date (CXP-028). */
export interface VoidSupplierPaymentCommand extends PayablesCommandEnvelope { readonly kind: "void_supplier_payment"; readonly paymentId: string; readonly expectedVersion: number; readonly reason: string; }
/** Reverses a payment with a compensating fact on its own date (CXP-029). */
export interface ReverseSupplierPaymentCommand extends PayablesCommandEnvelope { readonly kind: "reverse_supplier_payment"; readonly paymentId: string; readonly expectedVersion: number; readonly reversalDate: string; readonly reason: string; }
/** Replaces the company payables policy (D8 and withholding agent status). */
export interface ConfigurePayablesPolicyCommand extends PayablesCommandEnvelope { readonly kind: "configure_policy"; readonly expectedVersion: number; readonly separationRequired: boolean; readonly negativeAdjustmentThresholdVes: string | null; readonly vatWithholdingAgent: boolean; readonly islrWithholdingAgent: boolean; }
/** A second actor approves or rejects a negative adjustment above the threshold. */
export interface DecidePayableAdjustmentCommand extends PayablesCommandEnvelope { readonly kind: "decide_adjustment"; readonly documentId: string; readonly decision: "approved" | "rejected"; }
/** Marks a period's payment-time receipts as included in a filed declaration. */
export interface MarkWithholdingsDeclaredCommand extends PayablesCommandEnvelope { readonly kind: "mark_withholdings_declared"; readonly withholdingKind: "vat" | "islr"; readonly fiscalPeriod: string; }
/** Posts, or compensates after a void/reverse, a payment's accounting journal (CXP-031). */
export interface PayablesAccountingCommand extends PayablesCommandEnvelope { readonly kind: "post_payment_accounting" | "reverse_payment_accounting"; readonly paymentId: string; }
/** Commands persisted by the payables package. */
export type PayablesWriteCommand = CreateManualPayableCommand | ImportOpeningPayableCommand | CreatePayableAdjustmentCommand | ChangePayableDueDateCommand
  | ApplyPayableCreditCommand | ReversePayableCreditApplicationCommand | CreateInstallmentPlanCommand | UndoInstallmentPlanCommand
  | CreatePaymentBatchCommand | SetPaymentBatchItemCommand | SubmitPaymentBatchCommand | DecidePaymentBatchCommand
  | ExecuteSupplierPaymentCommand | ExecutePaymentBatchCommand | VoidSupplierPaymentCommand | ReverseSupplierPaymentCommand
  | ConfigurePayablesPolicyCommand | DecidePayableAdjustmentCommand | MarkWithholdingsDeclaredCommand | PayablesAccountingCommand;
/** Commands that move money and therefore need server-side valuation. */
export type PayablesDisbursementCommand = ExecuteSupplierPaymentCommand | ExecutePaymentBatchCommand;
/** Server-side ISLR calculation from the Decreto 1.808 concept catalog. */
export interface PayablesIslrCalculatorPort {
  /**
   * @param input - Concept code, taxable base in VES and the tax unit value in force.
   * @returns The rate and subtrahend to persist, or `null` when the law requires no withholding.
   * @throws {import("../domain/failure").PayablesFailure} When the concept is unknown or its tariff is not supported.
   */
  calculate(input: { readonly conceptCode: string; readonly taxableBaseVes: string; readonly taxUnitValue: string }): { readonly rate: string; readonly subtrahendVes: string } | null;
}
/** Commands that create a document and therefore need an authoritative VES valuation. */
export type PayablesValuedCommand = CreateManualPayableCommand | ImportOpeningPayableCommand | CreatePayableAdjustmentCommand;
/** Authoritative VES valuation resolved by the server for a newly created document. */
export type PayablesRateSnapshotInput = CreateManualPayableCommand["rateSnapshot"];
/** Resolves the company-approved VES valuation of a native amount; clients never supply it. */
export interface PayablesValuationPort {
  /**
   * @param input - Company scope, native currency, exact amount and valuation date.
   * @returns Immutable VES snapshot to persist with the document.
   * @throws {import("../domain/failure").PayablesFailure} When the currency is unsupported or no exact rate exists for the date.
   */
  value(input: { readonly organizationId: string; readonly companyId: string; readonly currency: string; readonly amount: string; readonly asOf: string }): Promise<PayablesRateSnapshotInput>;
}
/** Server authenticated scope sent to the SQL command boundary. */
export type PayablesCommandScope = PayablesScope;
/** Result envelope persisted for idempotent replay. */
export interface PayablesCommandResult {
  readonly commandId: string;
  readonly replayed: boolean;
  readonly affectedIds: readonly string[];
  readonly versions: Readonly<Record<string, number>>;
  /** Payments: non-blocking legal notices, such as a late withholding. */
  readonly warnings?: readonly { readonly code: string; readonly documentId?: string; readonly kind?: string }[];
  /** Payments by check: the number issued from the checkbook. */
  readonly checkNumber?: string | null;
  /** Payments: the Treasury debit linked to the payment. */
  readonly ledgerEntryId?: string;
  /** Accounting commands: the journal created or compensated. */
  readonly journalEntryId?: string;
}
/** Query for an isolated company payable list. */
export interface ListPayablesQuery extends PayablesScope {
  readonly status?: "open" | "settled" | "voided";
  readonly supplierId?: string;
  readonly limit: number;
  readonly offset: number;
}
/** One document and its derived balance in the requested query snapshot. */
export interface PayableListRow {
  readonly document: PayableDocument;
  readonly balance: string;
}
/** Stable page of payable documents. */
export interface PayableListResult {
  readonly rows: readonly PayableListRow[];
  readonly total: number;
}
/** Supported stable reports backed by one database snapshot. */
export type PayablesReportKind = "list_pending" | "list_settled" | "list_voided" | "supplier_balance" | "aging" | "supplier_statement" | "payment_history" | "payment_batches" | "document_detail"
  | "withholdings" | "suppliers" | "treasury_accounts" | "policy" | "accounting_reconciliation" | "withholding_voucher";
/** Company-scoped report filters passed to the server-side report RPC. */
export interface PayablesReportQuery extends PayablesScope {
  readonly kind: PayablesReportKind;
  readonly supplierId?: string;
  /** Required by `document_detail`. */
  readonly documentId?: string;
  readonly asOf?: string;
  readonly from?: string;
  readonly to?: string;
  readonly status?: string;
  /** Narrowing filters understood by the report kind (currency, documentKind, branchId, due and overdue ranges, payment and withholding filters). */
  readonly filters?: Readonly<Partial<Record<PayablesReportFilter, string>>>;
  readonly limit: number;
  readonly offset: number;
}
/** Optional filters accepted by the SQL report boundary. */
export type PayablesReportFilter = "currency" | "documentKind" | "branchId" | "dueFrom" | "dueTo" | "overdueMin" | "overdueMax" | "paymentId" | "method" | "accountId" | "createdBy" | "withholdingKind" | "fiscalPeriod" | "withholdingId";
/** Stable page of report rows projected by the SQL adapter. */
export interface PayablesReportResult {
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly total: number;
  readonly asOf?: string;
  /** Per-currency or per-period totals computed in the same snapshot. */
  readonly totals?: readonly Readonly<Record<string, unknown>>[];
  /** Reconciliation only: whether the company has active payables accounting rules. */
  readonly rulesActive?: boolean;
}
/** Persistence port implemented by the Supabase adapter. */
export interface PayablesRepository {
  /**
   * @param scope - Authenticated tenant, organization, company and actor.
   * @param command - Validated idempotent command.
   * @returns Persisted command receipt and affected document identifiers.
   * @throws {import("../domain/failure").PayablesFailure} When persistence rejects the operation.
   */
  execute(scope: PayablesCommandScope, command: PayablesWriteCommand): Promise<PayablesCommandResult>;
  /**
   * @param query - Tenant and company scope plus stable page filters.
   * @returns Rows and total count from one database snapshot.
   * @throws {import("../domain/failure").PayablesFailure} When the query is unavailable or forbidden.
   */
  list(query: ListPayablesQuery): Promise<PayableListResult>;
  /**
   * @param query - Company-scoped report kind, filters and page.
   * @returns One stable report page and its total count.
   * @throws {import("../domain/failure").PayablesFailure} When access is denied or the report cannot be loaded.
   */
  report(query: PayablesReportQuery): Promise<PayablesReportResult>;
}
/** History record created when a document due date changes. */
export type PayablesDueDateChange = DueDateChange;
