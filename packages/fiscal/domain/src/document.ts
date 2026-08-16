import type { CompanyId } from "@kontave/companies-domain";
import {
  addMoney,
  moneyFromMinor,
  sameCurrency,
  subtractMoney,
  type CurrencyDefinition,
  type ExactDecimal,
  type Money,
} from "@kontave/monetary-domain";
import { fiscalAdjustment, type FiscalAdjustment } from "./adjustment";
import { FiscalFailure } from "./fiscal-failure";
import type { FiscalDocumentId, FiscalDocumentLineId, FiscalNumber } from "./identifiers";
import { fiscalNumber } from "./identifiers";
import { fiscalParty, type FiscalPartySnapshot } from "./party";
import { fiscalPaymentAllocation, type FiscalPaymentAllocation } from "./payment-allocation";
import { fiscalTaxDetermination, type FiscalTaxDetermination, type FiscalTaxSummary } from "./tax";
import { fiscalDate, fiscalInstant, type FiscalDate, type FiscalInstant } from "./temporal";

export type FiscalDocumentType = "invoice" | "credit_note" | "debit_note";
export type FiscalDocumentDirection = "issued" | "received";
export type FiscalDocumentStatus = "draft" | "issued" | "received";

export interface AffectedFiscalDocument {
  readonly type: FiscalDocumentType;
  readonly fiscalNumber: FiscalNumber;
  readonly issueDate: FiscalDate;
  readonly issuerTaxIdentifier: string;
  readonly issuerRegistration: string | null;
  readonly internalDocumentId: FiscalDocumentId | null;
}

export interface FiscalDocumentLine {
  readonly id: FiscalDocumentLineId;
  readonly commercialReference: string | null;
  readonly description: string;
  readonly quantity: ExactDecimal;
  readonly unitCode: string;
  readonly unitPrice: Money;
  readonly grossAmount: Money;
  readonly adjustments: readonly FiscalAdjustment[];
  readonly netAmount: Money;
}

export interface FiscalDocumentTotals {
  readonly grossAmount: Money;
  readonly discountTotal: Money;
  readonly surchargeTotal: Money;
  readonly netAmount: Money;
  readonly taxSummaries: readonly FiscalTaxSummary[];
  readonly taxTotal: Money;
  readonly payableAmount: Money;
  readonly recognizedPayments: Money;
  readonly changeAmount: Money;
  readonly outstandingAmount: Money;
}

export interface FiscalIssuanceEvidence {
  readonly provider: string;
  readonly externalDocumentNumber: string;
  readonly authorization: string | null;
  readonly deviceRegistration: string | null;
}

export interface FiscalDocumentState {
  readonly id: FiscalDocumentId;
  readonly companyId: CompanyId;
  readonly type: FiscalDocumentType;
  readonly direction: FiscalDocumentDirection;
  readonly jurisdiction: string;
  readonly documentCurrency: CurrencyDefinition;
  readonly issuer: FiscalPartySnapshot;
  readonly recipient: FiscalPartySnapshot;
  readonly affectedDocument: AffectedFiscalDocument | null;
  readonly lines: readonly FiscalDocumentLine[];
  readonly documentAdjustments: readonly FiscalAdjustment[];
  readonly taxDeterminations: readonly FiscalTaxDetermination[];
  readonly payments: readonly FiscalPaymentAllocation[];
  readonly totals: FiscalDocumentTotals;
  readonly status: FiscalDocumentStatus;
  readonly number: FiscalNumber | null;
  readonly issuedAt: FiscalInstant | null;
  readonly issueDate: FiscalDate | null;
  readonly issuanceEvidence: FiscalIssuanceEvidence | null;
}

export interface IssueFiscalDocumentInput {
  readonly number: string;
  readonly issuedAt: string;
  readonly issueDate: string;
  readonly evidence: FiscalIssuanceEvidence | null;
}

export class FiscalDocument {
  readonly id: FiscalDocumentId;
  readonly companyId: CompanyId;
  readonly type: FiscalDocumentType;
  readonly direction: FiscalDocumentDirection;
  readonly jurisdiction: string;
  readonly documentCurrency: CurrencyDefinition;
  readonly issuer: FiscalPartySnapshot;
  readonly recipient: FiscalPartySnapshot;
  readonly affectedDocument: AffectedFiscalDocument | null;
  readonly lines: readonly FiscalDocumentLine[];
  readonly documentAdjustments: readonly FiscalAdjustment[];
  readonly taxDeterminations: readonly FiscalTaxDetermination[];
  readonly payments: readonly FiscalPaymentAllocation[];
  readonly totals: FiscalDocumentTotals;
  readonly status: FiscalDocumentStatus;
  readonly number: FiscalNumber | null;
  readonly issuedAt: FiscalInstant | null;
  readonly issueDate: FiscalDate | null;
  readonly issuanceEvidence: FiscalIssuanceEvidence | null;

  constructor(state: FiscalDocumentState) {
    this.id = state.id;
    this.companyId = state.companyId;
    this.type = state.type;
    this.direction = state.direction;
    this.jurisdiction = required(state.jurisdiction, 16, "jurisdiction").toUpperCase();
    this.documentCurrency = state.documentCurrency;
    this.issuer = fiscalParty(state.issuer);
    this.recipient = fiscalParty(state.recipient);
    this.affectedDocument = validateReference(state.type, state.affectedDocument);
    this.lines = Object.freeze(state.lines.map((line) => validateLine(line, state.documentCurrency)));
    if (this.lines.length === 0 || new Set(this.lines.map((line) => line.id)).size !== this.lines.length) {
      throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Fiscal document requires uniquely identified lines.");
    }
    this.documentAdjustments = Object.freeze(state.documentAdjustments.map((adjustment) => {
      const validated = fiscalAdjustment(adjustment);
      if (validated.scope !== "document") throw new FiscalFailure("FISCAL_ADJUSTMENT_INVALID", "Document adjustment must have document scope.");
      requireCurrency(validated.amount, state.documentCurrency);
      return validated;
    }));
    this.taxDeterminations = Object.freeze(state.taxDeterminations.map((tax) => {
      const validated = fiscalTaxDetermination(tax);
      requireCurrency(validated.amount, state.documentCurrency);
      if (validated.jurisdiction !== this.jurisdiction) throw new FiscalFailure("FISCAL_TAX_INVALID", "Tax jurisdiction differs from the document jurisdiction.");
      if (validated.source.kind === "line") {
        const sourceLineId = validated.source.lineId;
        if (!this.lines.some((line) => line.id === sourceLineId)) {
          throw new FiscalFailure("FISCAL_TAX_INVALID", "Tax references a line outside the fiscal document.");
        }
      }
      return validated;
    }));
    this.payments = Object.freeze(state.payments.map((payment) => {
      const validated = fiscalPaymentAllocation(payment);
      requireCurrency(validated.recognizedAmount, state.documentCurrency);
      return validated;
    }));
    if (new Set(this.payments.map((payment) => payment.key)).size !== this.payments.length) {
      throw new FiscalFailure("FISCAL_PAYMENT_INVALID", "Fiscal payment keys must be unique.");
    }
    if (this.taxDeterminations.some((tax) => {
      if (tax.source.kind !== "payment") return false;
      const paymentKey = tax.source.paymentKey;
      return !this.payments.some((payment) => payment.key === paymentKey);
    })) {
      throw new FiscalFailure("FISCAL_TAX_INVALID", "Payment tax references an unknown fiscal payment.");
    }
    this.totals = validateTotals(state.totals, this);
    validateLifecycle(state);
    this.status = state.status;
    this.number = state.number;
    this.issuedAt = state.issuedAt;
    this.issueDate = state.issueDate;
    this.issuanceEvidence = state.issuanceEvidence === null ? null : validateEvidence(state.issuanceEvidence);
  }

  issue(input: IssueFiscalDocumentInput): FiscalDocument {
    if (this.status !== "draft" || this.direction !== "issued") {
      throw new FiscalFailure("FISCAL_TRANSITION_INVALID", "Only an outbound draft fiscal document can be issued.");
    }
    return new FiscalDocument({
      ...this,
      status: "issued",
      number: fiscalNumber(input.number),
      issuedAt: fiscalInstant(input.issuedAt),
      issueDate: fiscalDate(input.issueDate),
      issuanceEvidence: input.evidence,
    });
  }

  registerReceived(input: IssueFiscalDocumentInput): FiscalDocument {
    if (this.status !== "draft" || this.direction !== "received") {
      throw new FiscalFailure("FISCAL_TRANSITION_INVALID", "Only an inbound draft fiscal document can be registered as received.");
    }
    return new FiscalDocument({
      ...this,
      status: "received",
      number: fiscalNumber(input.number),
      issuedAt: fiscalInstant(input.issuedAt),
      issueDate: fiscalDate(input.issueDate),
      issuanceEvidence: input.evidence,
    });
  }
}

function validateLine(line: FiscalDocumentLine, currency: CurrencyDefinition): FiscalDocumentLine {
  if (line.quantity.startsWith("-") || line.quantity === "0" || line.unitPrice.minorAmount < 0n || line.grossAmount.minorAmount < 0n || line.netAmount.minorAmount < 0n) {
    throw new FiscalFailure("FISCAL_LINE_INVALID", "Fiscal line quantities and amounts are invalid.");
  }
  const description = required(line.description, 500, "line description");
  const unitCode = required(line.unitCode, 32, "unit code").toUpperCase();
  requireCurrency(line.unitPrice, currency);
  requireCurrency(line.grossAmount, currency);
  requireCurrency(line.netAmount, currency);
  const adjustments = line.adjustments.map((adjustment) => {
    const validated = fiscalAdjustment(adjustment);
    if (validated.scope !== "line") throw new FiscalFailure("FISCAL_ADJUSTMENT_INVALID", "Line adjustment must have line scope.");
    requireCurrency(validated.amount, currency);
    return validated;
  });
  const discount = sumMoney(adjustments.filter((item) => item.kind === "discount").map((item) => item.amount), currency);
  const surcharge = sumMoney(adjustments.filter((item) => item.kind === "surcharge").map((item) => item.amount), currency);
  if (subtractMoney(addMoney(line.grossAmount, surcharge), discount).minorAmount !== line.netAmount.minorAmount) {
    throw new FiscalFailure("FISCAL_TOTALS_MISMATCH", "Fiscal line net amount does not reconcile with its adjustments.");
  }
  return { ...line, description, unitCode, commercialReference: line.commercialReference?.trim() || null, adjustments: Object.freeze(adjustments) };
}

function validateTotals(totals: FiscalDocumentTotals, document: Pick<FiscalDocument, "documentCurrency" | "lines" | "documentAdjustments" | "taxDeterminations" | "payments">): FiscalDocumentTotals {
  const currency = document.documentCurrency;
  const scalarTotals = [totals.grossAmount, totals.discountTotal, totals.surchargeTotal, totals.netAmount, totals.taxTotal,
    totals.payableAmount, totals.recognizedPayments, totals.changeAmount, totals.outstandingAmount];
  for (const amount of scalarTotals) requireCurrency(amount, currency);
  if (scalarTotals.some((amount) => amount.minorAmount < 0n)) throw new FiscalFailure("FISCAL_TOTALS_MISMATCH", "Fiscal totals cannot be negative.");
  const lineAdjustments = document.lines.flatMap((line) => line.adjustments);
  const allAdjustments = [...lineAdjustments, ...document.documentAdjustments];
  const expectedGross = sumMoney(document.lines.map((line) => line.grossAmount), currency);
  const expectedDiscount = sumMoney(allAdjustments.filter((item) => item.kind === "discount").map((item) => item.amount), currency);
  const expectedSurcharge = sumMoney(allAdjustments.filter((item) => item.kind === "surcharge").map((item) => item.amount), currency);
  const expectedNet = subtractMoney(addMoney(expectedGross, expectedSurcharge), expectedDiscount);
  const expectedTax = sumMoney(document.taxDeterminations.map((tax) => tax.amount), currency);
  const expectedAddedTax = sumMoney(document.taxDeterminations.filter((tax) => tax.calculationMode === "tax_exclusive").map((tax) => tax.amount), currency);
  const expectedTaxSummaries = summarizeTaxes(document.taxDeterminations);
  const expectedPayable = addMoney(expectedNet, expectedAddedTax);
  const expectedPayments = sumMoney(document.payments.map((payment) => payment.recognizedAmount), currency);
  const expectedOutstanding = subtractMoney(addMoney(expectedPayable, totals.changeAmount), expectedPayments);
  const expectations: readonly [Money, Money][] = [
    [totals.grossAmount, expectedGross], [totals.discountTotal, expectedDiscount], [totals.surchargeTotal, expectedSurcharge],
    [totals.netAmount, expectedNet], [totals.taxTotal, expectedTax], [totals.payableAmount, expectedPayable], [totals.recognizedPayments, expectedPayments],
    [totals.outstandingAmount, expectedOutstanding],
  ];
  if (expectations.some(([actual, expected]) => actual.minorAmount !== expected.minorAmount) || expectedOutstanding.minorAmount < 0n ||
      !sameTaxSummaries(totals.taxSummaries, expectedTaxSummaries, currency)) {
    throw new FiscalFailure("FISCAL_TOTALS_MISMATCH", "Fiscal document totals do not reconcile.");
  }
  return { ...totals, taxSummaries: Object.freeze(totals.taxSummaries.map((summary) => ({ ...summary }))) };
}

function summarizeTaxes(taxes: readonly FiscalTaxDetermination[]): readonly FiscalTaxSummary[] {
  const summaries = new Map<string, FiscalTaxSummary>();
  for (const tax of taxes) {
    const key = `${tax.taxCode}|${tax.category}|${tax.calculationMode}|${tax.rate}`;
    const current = summaries.get(key);
    summaries.set(key, current === undefined
      ? { taxCode: tax.taxCode, category: tax.category, calculationMode: tax.calculationMode, rate: tax.rate, taxableBase: tax.taxableBase, amount: tax.amount }
      : { ...current, taxableBase: addMoney(current.taxableBase, tax.taxableBase), amount: addMoney(current.amount, tax.amount) });
  }
  return [...summaries.values()].sort((left, right) => `${left.taxCode}|${left.category}|${left.calculationMode}|${left.rate}`.localeCompare(`${right.taxCode}|${right.category}|${right.calculationMode}|${right.rate}`));
}

function sameTaxSummaries(actual: readonly FiscalTaxSummary[], expected: readonly FiscalTaxSummary[], currency: CurrencyDefinition): boolean {
  if (actual.length !== expected.length) return false;
  const normalized = [...actual].map((summary) => {
    requireCurrency(summary.taxableBase, currency);
    requireCurrency(summary.amount, currency);
    return summary;
  }).sort((left, right) => `${left.taxCode}|${left.category}|${left.calculationMode}|${left.rate}`.localeCompare(`${right.taxCode}|${right.category}|${right.calculationMode}|${right.rate}`));
  return normalized.every((summary, index) => {
    const wanted = expected[index];
    return wanted !== undefined && summary.taxCode === wanted.taxCode && summary.category === wanted.category &&
      summary.calculationMode === wanted.calculationMode && summary.rate === wanted.rate &&
      summary.taxableBase.minorAmount === wanted.taxableBase.minorAmount && summary.amount.minorAmount === wanted.amount.minorAmount;
  });
}

function validateReference(type: FiscalDocumentType, reference: AffectedFiscalDocument | null): AffectedFiscalDocument | null {
  if ((type === "invoice") !== (reference === null)) {
    throw new FiscalFailure("FISCAL_REFERENCE_INVALID", "Credit and debit notes require one affected document; invoices cannot have one.");
  }
  if (reference === null) return null;
  const issuerTaxIdentifier = required(reference.issuerTaxIdentifier, 64, "affected issuer tax identifier").toUpperCase().replace(/\s+/g, "");
  return { ...reference, issuerTaxIdentifier, issuerRegistration: reference.issuerRegistration?.trim() || null };
}

function validateLifecycle(state: FiscalDocumentState): void {
  const complete = state.number !== null && state.issuedAt !== null && state.issueDate !== null;
  if ((state.status !== "draft") !== complete) {
    throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Fiscal document lifecycle fields are inconsistent.");
  }
  if ((state.status === "issued" && state.direction !== "issued") || (state.status === "received" && state.direction !== "received")) {
    throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Fiscal document status is incompatible with its direction.");
  }
  if (state.status === "draft" && state.issuanceEvidence !== null) {
    throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Draft fiscal document cannot retain issuance evidence.");
  }
}

function validateEvidence(input: FiscalIssuanceEvidence): FiscalIssuanceEvidence {
  return {
    provider: required(input.provider, 128, "issuance provider"),
    externalDocumentNumber: required(input.externalDocumentNumber, 128, "external document number"),
    authorization: input.authorization?.trim() || null,
    deviceRegistration: input.deviceRegistration?.trim() || null,
  };
}

function sumMoney(values: readonly Money[], currency: CurrencyDefinition): Money {
  return values.reduce((total, value) => addMoney(total, value), moneyFromMinor(0n, currency));
}

function requireCurrency(amount: Money, currency: CurrencyDefinition): void {
  if (!sameCurrency(amount.currency, currency)) throw new FiscalFailure("FISCAL_CURRENCY_MISMATCH", "Fiscal amount differs from the document currency.");
}

function required(value: string, limit: number, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > limit) throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", `Fiscal ${name} is invalid.`);
  return normalized;
}
