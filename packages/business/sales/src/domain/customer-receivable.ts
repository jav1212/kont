import type { CompanyId } from "@kontave/companies/domain";
import {
  compareDecimal,
  compareMoney,
  divideDecimal,
  exactDecimal,
  moneyFromMinor,
  moneyToDecimal,
  multiplyDecimal,
  quantizeMoney,
  sameCurrency,
  type CurrencyDefinition,
  type ExactDecimal,
  type Money,
} from "@kontave/monetary/domain";
import type { CustomerId } from "./identifiers";
import { SalesFailure } from "./sales-failure";
import { salesDate, salesInstant, type SalesDate, type SalesInstant } from "./temporal";

declare const customerReceivableIdBrand: unique symbol;
declare const receivablePaymentIdBrand: unique symbol;

/** Identifies one customer account receivable. */
export type CustomerReceivableId = string & { readonly [customerReceivableIdBrand]: true };
/** Identifies an immutable payment entry within a customer receivable. */
export type ReceivablePaymentId = string & { readonly [receivablePaymentIdBrand]: true };

/**
 * Creates a validated customer-receivable identifier.
 * @param value - Raw identifier supplied by persistence or a caller.
 * @returns The normalized identifier.
 * @throws {SalesFailure} When the identifier is empty or too long.
 */
export function customerReceivableId(value: string): CustomerReceivableId {
  return receivableIdentifier(value, "receivable") as CustomerReceivableId;
}

/**
 * Creates a validated receivable-payment identifier.
 * @param value - Raw identifier supplied by persistence or a caller.
 * @returns The normalized identifier.
 * @throws {SalesFailure} When the identifier is empty or too long.
 */
export function receivablePaymentId(value: string): ReceivablePaymentId {
  return receivableIdentifier(value, "payment") as ReceivablePaymentId;
}

/** Immutable snapshot of a currency's identity and supported precision. */
export interface ReceivableCurrencySnapshot extends CurrencyDefinition {}

/** Immutable VES-per-unit rate captured when a receivable is opened or a payment is accepted. */
export interface ReceivableVesRateSnapshot {
  readonly currency: ReceivableCurrencySnapshot;
  readonly vesPerUnit: ExactDecimal;
  readonly effectiveDate: SalesDate;
  readonly capturedAt: SalesInstant;
  readonly source: string;
}

/** Payment evidence retained after a payment reduces the debt balance. */
export interface ReceivablePayment {
  readonly id: ReceivablePaymentId;
  readonly idempotencyKey: string;
  readonly receivedAmount: Money;
  readonly receivedVesRate: ReceivableVesRateSnapshot;
  readonly appliedDebtAmount: Money;
  readonly occurredAt: SalesInstant;
}

/** State required to rehydrate a customer receivable without recalculating historical terms. */
export interface CustomerReceivableState {
  readonly id: CustomerReceivableId;
  readonly companyId: CompanyId;
  readonly customerId: CustomerId;
  readonly saleReference: string;
  readonly saleDate: SalesDate;
  readonly principal: Money;
  readonly debtVesRate: ReceivableVesRateSnapshot;
  readonly dueDate: SalesDate;
  readonly payments: readonly ReceivablePayment[];
  readonly version: number;
}

/** Input needed to apply a payment against a customer receivable. */
export interface RecordReceivablePayment {
  readonly id: ReceivablePaymentId;
  readonly idempotencyKey: string;
  readonly receivedAmount: Money;
  readonly receivedVesRate: ReceivableVesRateSnapshot;
  readonly occurredAt: SalesInstant;
}

/** Result of applying one payment, including a durable replay indication for the idempotency key. */
export interface RecordReceivablePaymentResult {
  readonly receivable: CustomerReceivable;
  readonly payment: ReceivablePayment;
  readonly replayed: boolean;
}

/** Input from a confirmed credit invoice that opens its customer receivable. */
export interface ConfirmedCreditInvoice {
  readonly receivableId: CustomerReceivableId;
  readonly companyId: CompanyId;
  readonly customerId: CustomerId;
  readonly customerIdentified: boolean;
  readonly invoiceReference: string;
  readonly saleDate: SalesDate;
  readonly principal: Money;
  readonly debtVesRate: ReceivableVesRateSnapshot;
  readonly dueDate: SalesDate;
}

/**
 * Opens a receivable from a confirmed credit invoice after its caller established the customer identity.
 * @param invoice - Confirmed invoice agreement and currency snapshots.
 * @returns A new receivable with no payments and version zero.
 * @throws {SalesFailure} When the invoice lacks an identified customer or violates receivable invariants.
 */
export function createCustomerReceivableFromConfirmedCreditInvoice(invoice: ConfirmedCreditInvoice): CustomerReceivable {
  if (!invoice.customerIdentified) throw invalid("Credit invoices require an identified customer.");
  return new CustomerReceivable({
    id: invoice.receivableId,
    companyId: invoice.companyId,
    customerId: invoice.customerId,
    saleReference: invoice.invoiceReference,
    saleDate: invoice.saleDate,
    principal: invoice.principal,
    debtVesRate: invoice.debtVesRate,
    dueDate: invoice.dueDate,
    payments: [],
    version: 0,
  });
}

/**
 * Owns the debt agreement and the immutable payment ledger for one customer sale.
 * Debt remains denominated in its agreed currency. Cross-currency payments are
 * converted through VES using the recorded rates and half-up rounding at the debt
 * currency's minor unit.
 */
export class CustomerReceivable {
  readonly id: CustomerReceivableId;
  readonly companyId: CompanyId;
  readonly customerId: CustomerId;
  readonly saleReference: string;
  readonly saleDate: SalesDate;
  readonly principal: Money;
  readonly debtVesRate: ReceivableVesRateSnapshot;
  readonly dueDate: SalesDate;
  readonly payments: readonly ReceivablePayment[];
  readonly version: number;

  /**
   * Rehydrates a receivable while checking its immutable commercial agreement and ledger.
   * @param state - Persisted agreement, rate snapshots, and payment entries.
   * @throws {SalesFailure} When the agreement, a rate, or a payment ledger entry is invalid.
   */
  constructor(state: CustomerReceivableState) {
    if (state.principal.minorAmount <= 0n) throw invalid("Receivable principal must be positive.");
    if (!Number.isSafeInteger(state.version) || state.version < 0) throw invalid("Receivable version is invalid.");
    this.id = state.id;
    this.companyId = state.companyId;
    this.customerId = state.customerId;
    this.saleReference = required(state.saleReference, "sale reference");
    this.saleDate = salesDate(state.saleDate);
    this.principal = snapshotMoney(state.principal);
    this.debtVesRate = snapshotRate(state.debtVesRate, this.principal.currency);
    this.dueDate = salesDate(state.dueDate);
    if (this.dueDate < this.saleDate) throw invalid("Receivable due date cannot precede its sale date.");
    this.payments = Object.freeze(state.payments.map((payment) => snapshotPayment(payment, this.principal.currency)));
    this.version = state.version;
    assertUniquePaymentKeys(this.payments);
    if (this.payments.some((payment) => compareMoney(payment.appliedDebtAmount, this.principal) > 0)) {
      throw invalid("A receivable payment exceeds its principal.");
    }
    if (this.balance.minorAmount < 0n) throw new SalesFailure("SALES_RECEIVABLE_PAYMENT_EXCEEDS_BALANCE", "Receivable payments exceed its principal.");
  }

  /**
   * Returns the unpaid amount in the agreed debt currency.
   * @returns The non-negative remaining debt.
   */
  get balance(): Money {
    const paidMinor = this.payments.reduce((total, payment) => total + payment.appliedDebtAmount.minorAmount, 0n);
    return moneyFromMinor(this.principal.minorAmount - paidMinor, this.principal.currency);
  }

  /**
   * Applies a payment or returns its previous immutable entry when the key was already accepted.
   * @param input - Payment amount, VES conversion snapshot, stable key, and occurrence instant.
   * @returns The resulting receivable and payment entry.
   * @throws {SalesFailure} When payment data is invalid, conflicts with an existing key, or exceeds the balance.
   */
  recordPayment(input: RecordReceivablePayment): RecordReceivablePaymentResult {
    const key = required(input.idempotencyKey, "payment idempotency key");
    const replay = this.payments.find((payment) => payment.idempotencyKey === key);
    if (replay) {
      if (!samePaymentRequest(replay, input)) {
        throw new SalesFailure("SALES_RECEIVABLE_IDEMPOTENCY_CONFLICT", "Payment idempotency key belongs to another payment request.");
      }
      return { receivable: this, payment: replay, replayed: true };
    }
    if (input.receivedAmount.minorAmount <= 0n) throw paymentInvalid("Received payment must be positive.");
    const receivedAmount = snapshotMoney(input.receivedAmount);
    const receivedVesRate = snapshotRate(input.receivedVesRate, receivedAmount.currency);
    const appliedDebtAmount = convertToDebt(receivedAmount, receivedVesRate, this.debtVesRate);
    if (appliedDebtAmount.minorAmount <= 0n) throw paymentInvalid("Payment rounds to zero in the debt currency.");
    if (compareMoney(appliedDebtAmount, this.balance) > 0) {
      throw new SalesFailure("SALES_RECEIVABLE_PAYMENT_EXCEEDS_BALANCE", "Payment exceeds the remaining receivable balance.");
    }
    const payment: ReceivablePayment = Object.freeze({
      id: input.id,
      idempotencyKey: key,
      receivedAmount,
      receivedVesRate,
      appliedDebtAmount,
      occurredAt: input.occurredAt,
    });
    const receivable = new CustomerReceivable({ ...this, payments: [...this.payments, payment], version: this.version + 1 });
    return { receivable, payment, replayed: false };
  }
}

function convertToDebt(received: Money, receivedRate: ReceivableVesRateSnapshot, debtRate: ReceivableVesRateSnapshot): Money {
  const exactDebtAmount = divideDecimal(
    multiplyDecimal(moneyToDecimal(received), receivedRate.vesPerUnit),
    debtRate.vesPerUnit,
  );
  return quantizeMoney(exactDebtAmount, debtRate.currency, "half_up");
}

function snapshotPayment(payment: ReceivablePayment, debtCurrency: CurrencyDefinition): ReceivablePayment {
  if (payment.receivedAmount.minorAmount <= 0n || payment.appliedDebtAmount.minorAmount <= 0n) throw paymentInvalid("Stored payment amounts must be positive.");
  if (!sameCurrency(payment.appliedDebtAmount.currency, debtCurrency)) throw paymentInvalid("Stored payment has another debt currency.");
  return Object.freeze({
    id: payment.id,
    idempotencyKey: required(payment.idempotencyKey, "payment idempotency key"),
    receivedAmount: snapshotMoney(payment.receivedAmount),
    receivedVesRate: snapshotRate(payment.receivedVesRate, payment.receivedAmount.currency),
    appliedDebtAmount: snapshotMoney(payment.appliedDebtAmount),
    occurredAt: payment.occurredAt,
  });
}

function snapshotMoney(value: Money): Money {
  return Object.freeze(moneyFromMinor(value.minorAmount, snapshotCurrency(value.currency)));
}

function snapshotRate(value: ReceivableVesRateSnapshot, expectedCurrency: CurrencyDefinition): ReceivableVesRateSnapshot {
  if (!sameCurrency(value.currency, expectedCurrency)) throw invalid("VES rate currency does not match its amount currency.");
  const currency = snapshotCurrency(value.currency);
  const rate = exactDecimal(value.vesPerUnit);
  if (compareDecimal(rate, exactDecimal("0")) <= 0) throw invalid("VES rate must be positive.");
  if (currency.code === "VES" && rate !== exactDecimal("1")) throw invalid("VES rates must use the explicit identity value of 1.");
  return Object.freeze({
    currency,
    vesPerUnit: rate,
    effectiveDate: salesDate(value.effectiveDate),
    capturedAt: salesInstant(value.capturedAt),
    source: required(value.source, "VES rate source"),
  });
}

function snapshotCurrency(value: CurrencyDefinition): ReceivableCurrencySnapshot {
  if (!Number.isInteger(value.minorUnit) || value.minorUnit < 0 || value.minorUnit > 100) throw invalid("Currency minor unit is invalid.");
  return Object.freeze({ code: value.code, minorUnit: value.minorUnit });
}

function samePaymentRequest(payment: ReceivablePayment, input: RecordReceivablePayment): boolean {
  return payment.id === input.id
    && payment.occurredAt === input.occurredAt
    && payment.receivedAmount.minorAmount === input.receivedAmount.minorAmount
    && sameCurrency(payment.receivedAmount.currency, input.receivedAmount.currency)
    && payment.receivedVesRate.vesPerUnit === input.receivedVesRate.vesPerUnit
    && sameCurrency(payment.receivedVesRate.currency, input.receivedVesRate.currency)
    && payment.receivedVesRate.effectiveDate === input.receivedVesRate.effectiveDate
    && payment.receivedVesRate.capturedAt === input.receivedVesRate.capturedAt
    && payment.receivedVesRate.source === input.receivedVesRate.source;
}

function assertUniquePaymentKeys(payments: readonly ReceivablePayment[]): void {
  const keys = new Set<string>();
  for (const payment of payments) {
    if (keys.has(payment.idempotencyKey)) throw new SalesFailure("SALES_RECEIVABLE_IDEMPOTENCY_CONFLICT", "Receivable contains a duplicate payment idempotency key.");
    keys.add(payment.idempotencyKey);
  }
}

function receivableIdentifier(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) throw invalid(`Receivable ${name} identifier is invalid.`);
  return normalized;
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 256) throw invalid(`Receivable ${name} is invalid.`);
  return normalized;
}

function invalid(message: string): SalesFailure {
  return new SalesFailure("SALES_RECEIVABLE_INVALID", message);
}

function paymentInvalid(message: string): SalesFailure {
  return new SalesFailure("SALES_RECEIVABLE_PAYMENT_INVALID", message);
}
