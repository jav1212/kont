import { addMoney, moneyFromMinor, type Money, sameCurrency } from "@kontave/monetary/domain";
import { taxCounterpartyFiscalProfile, type TaxCounterpartyFiscalProfile } from "@kontave/taxation/domain";
import { TaxReportingFailure } from "./tax-reporting-failure";

/** Fully-qualified owner required for every reporting operation. */
export interface TaxReportingScope { readonly tenantId: string; readonly organizationId: string; readonly companyId: string; }
/** Commercial source preserved to prevent two representations of one document entering a ledger. */
export interface TaxReportingSource { readonly kind: "legacy_purchase_invoice" | "legacy_purchase_credit_note" | "legacy_purchase_debit_note" | "legacy_sales_invoice" | "legacy_sales_credit_note" | "legacy_delivery_note" | "fiscal_document" | "custom"; readonly id: string; readonly lineageKey: string; }
/** Historical tax-rate group; its rate and amounts are snapshots, never resolved from current rules. */
export interface VatRateBreakdown { readonly rate: string; readonly category: "taxable" | "zero_rated" | "exempt" | "exonerated" | "non_subject" | "unknown"; readonly taxableBase: Money; readonly taxAmount: Money; readonly ruleVersion: string | null; readonly component?: "base" | "luxury" | "payment"; }
/** Legal evidence attached when an import transaction claims an exemption or exoneration. */
export interface ImportReliefEvidence { readonly legalInstrument: string; readonly certificateReference: string; readonly issuedAt: string; }
/** Customs declaration and assessed amounts source for imported goods. */
export interface GoodsImportEvidence { readonly kind: "goods"; readonly declarationNumber: string; readonly declaredAt: string; readonly paidAt: string; readonly paymentReference: string; readonly authority: string; readonly tariffCode: string; readonly reference: string | null; readonly relief: ImportReliefEvidence | null; }
/** Invoice and payment source for a service acquired from a foreign provider. */
export interface ForeignServiceImportEvidence { readonly kind: "foreign_service"; readonly invoiceReference: string; readonly serviceDate: string; readonly paidAt: string; readonly paymentReference: string; readonly providerCountryCode: string; readonly relief: ImportReliefEvidence | null; }
/** Source evidence for an imported good or foreign service, without inferred tax amounts. */
export type ImportTaxEvidence = GoodsImportEvidence | ForeignServiceImportEvidence;
/** Reconciliation state prevents unexplained historical differences from becoming a declaration. */
export interface ReconciliationState { readonly state: "reconciled" | "issue"; readonly reason: string | null; readonly expectedTaxAmount: Money | null; }
/** Immutable normalized fiscal fact used to derive books and declarations. Signed values carry correction direction exactly once. */
export interface TaxReportingFact { readonly id: string; readonly scope: TaxReportingScope; readonly source: TaxReportingSource; readonly direction: "purchase" | "sale" | "import"; readonly documentKind: "invoice" | "credit_note" | "debit_note" | "return" | "import_declaration" | "foreign_service_assessment" | "adjustment"; readonly documentDate: string; readonly recognitionDate: string; readonly period: string; readonly counterparty: { readonly taxIdentifier: string | null; readonly name: string | null; readonly countryCode: string | null }; readonly counterpartyFiscalProfile: TaxCounterpartyFiscalProfile | null; readonly currency: Money["currency"]; readonly signed: { readonly taxableBase: Money; readonly taxAmount: Money; readonly exemptBase: Money; readonly total: Money }; readonly rateBreakdowns: readonly VatRateBreakdown[]; readonly affectedFactId: string | null; readonly affectedSourceId: string | null; readonly deductible: { readonly state: "eligible" | "ineligible" | "pending_review"; readonly amount: Money; readonly reason: string | null }; readonly withholding: { readonly kind: "practiced" | "suffered"; readonly amount: Money; readonly certificateReference: string | null; readonly occurredAt: string } | null; readonly importEvidence: ImportTaxEvidence | null; readonly reconciliation: ReconciliationState; readonly recordedAt: string; }

/** Validates a historical fact without recalculating any fiscal amount. @param value - Candidate snapshot. @returns Immutable validated fact. @throws {TaxReportingFailure} When lineage, period, signs, or money consistency is invalid. */
export function taxReportingFact(value: TaxReportingFact): TaxReportingFact {
  requireText(value.id, "fact id"); requireScope(value.scope); requireText(value.source.id, "source id"); requireText(value.source.lineageKey, "source lineage");
  if (!SOURCE_KINDS.has(value.source.kind)) invalid("Unknown reporting source kind.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.period)
    || !isRealDate(value.documentDate)
    || !isRealDate(value.recognitionDate)
    || (!value.source.kind.startsWith("legacy_") && value.period !== value.recognitionDate.slice(0, 7))
    || !isRealInstant(value.recordedAt)) {
    invalid("A fact needs real ISO dates, a valid fiscal period, and a recorded instant.");
  }
  const amounts = [value.signed.taxableBase, value.signed.taxAmount, value.signed.exemptBase, value.signed.total, value.deductible.amount];
  if (!amounts.every((amount) => sameCurrency(amount.currency, value.currency))) invalid("Fact amounts must use its historical currency.");
  const counterpartyFiscalProfile = value.counterpartyFiscalProfile === null ? null : taxCounterpartyFiscalProfile(value.counterpartyFiscalProfile);
  if (counterpartyFiscalProfile !== null && (counterpartyFiscalProfile.companyId !== value.scope.companyId
    || !isRealDate(counterpartyFiscalProfile.effectiveFrom)
    || (counterpartyFiscalProfile.effectiveTo !== null && !isRealDate(counterpartyFiscalProfile.effectiveTo))
    || counterpartyFiscalProfile.effectiveFrom > value.documentDate
    || (counterpartyFiscalProfile.effectiveTo !== null && counterpartyFiscalProfile.effectiveTo < value.documentDate))) {
    invalid("Counterparty fiscal profile must belong to the reporting company and be effective on the document date.");
  }
  if (absolute(value.deductible.amount) > absolute(value.signed.taxAmount)) invalid("Deductible credit cannot exceed the recorded tax.");
  let breakdownBase = moneyFromMinor(0n, value.currency); let breakdownTax = moneyFromMinor(0n, value.currency);
  for (const breakdown of value.rateBreakdowns) { if (!sameCurrency(breakdown.taxableBase.currency, value.currency) || !sameCurrency(breakdown.taxAmount.currency, value.currency)) invalid("Rate breakdown currency differs from fact."); if (!/^-?\d+(\.\d+)?$/.test(breakdown.rate)) invalid("Rate must be an exact decimal string."); if (breakdown.component === undefined || breakdown.component === "base") breakdownBase = addMoney(breakdownBase, breakdown.taxableBase); breakdownTax = addMoney(breakdownTax, breakdown.taxAmount); }
  if (breakdownBase.minorAmount !== addMoney(value.signed.taxableBase, value.signed.exemptBase).minorAmount || breakdownTax.minorAmount !== value.signed.taxAmount.minorAmount) invalid("Rate breakdowns must reconcile to signed tax bases and amounts.");
  const isGoodsImport = value.documentKind === "import_declaration";
  const isForeignServiceImport = value.documentKind === "foreign_service_assessment";
  const isImport = isGoodsImport || isForeignServiceImport;
  if ((value.direction === "import") !== isImport) invalid("Import direction and import document kind must agree.");
  if (isGoodsImport && (value.importEvidence?.kind !== "goods" || !validGoodsImportEvidence(value.importEvidence))) invalid("A goods import requires its declaration, date, tariff code, and assessed payment evidence.");
  if (isForeignServiceImport && (value.importEvidence?.kind !== "foreign_service" || !validForeignServiceImportEvidence(value.importEvidence))) invalid("A foreign-service import requires its invoice, service date, payment, and provider country evidence.");
  if (!isImport && value.importEvidence !== null) invalid("Import evidence belongs only to an import fact.");
  if (isImport && value.rateBreakdowns.some((breakdown) => breakdown.category === "exonerated") && !value.importEvidence?.relief) invalid("An exonerated import requires its legal instrument and benefit certificate evidence.");
  if (value.source.kind === "legacy_delivery_note") invalid("A delivery note cannot be recognized as a VAT fact.");
  const correction = ["credit_note", "debit_note", "return"].includes(value.documentKind);
  if (correction && (value.affectedFactId === null || value.affectedFactId === value.id || !validText(value.affectedSourceId ?? "", 256))) invalid("A correction requires distinct affected fact and source identities.");
  if (!correction && (value.affectedFactId !== null || value.affectedSourceId !== null)) invalid("Only corrections can reference an affected fact and source.");
  if (correction) {
    const sign = value.documentKind === "debit_note" ? 1n : -1n;
    const correctionAmounts = [value.signed.taxableBase, value.signed.taxAmount, value.signed.exemptBase, value.signed.total, value.deductible.amount,
      ...value.rateBreakdowns.flatMap((breakdown) => [breakdown.taxableBase, breakdown.taxAmount])];
    if (correctionAmounts.some((amount) => sign < 0n ? amount.minorAmount > 0n : amount.minorAmount < 0n)) invalid("Correction amounts must carry the sign implied by the document kind.");
  }
  if (value.withholding !== null && (!sameCurrency(value.withholding.amount.currency, value.currency) || !isRealInstant(value.withholding.occurredAt))) invalid("Withholding evidence is invalid.");
  return freezeFact({ ...value, counterpartyFiscalProfile });
}

/** Adds values in a historical currency. @param values - Amounts with the same currency. @returns Exact sum. @throws {TaxReportingFailure} When no values or mixed currency are supplied. */
export function sumFactMoney(values: readonly Money[]): Money { if (values.length === 0) invalid("At least one amount is required."); return values.slice(1).reduce((total, amount) => addMoney(total, amount), values[0]!); }
function requireScope(scope: TaxReportingScope): void { requireText(scope.tenantId, "tenant"); requireText(scope.organizationId, "organization"); requireText(scope.companyId, "company"); }
function requireText(value: string, name: string): void { if (value.trim().length === 0 || value.trim().length > 256) invalid(`Invalid ${name}.`); }
function invalid(message: string): never { throw new TaxReportingFailure("TAX_REPORTING_INVALID", message); }
function absolute(value: Money): bigint { return value.minorAmount < 0n ? -value.minorAmount : value.minorAmount; }
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function isRealInstant(value: string): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !isRealDate(value.slice(0, 10))) return false;
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
const SOURCE_KINDS = new Set<TaxReportingSource["kind"]>(["legacy_purchase_invoice", "legacy_purchase_credit_note", "legacy_purchase_debit_note", "legacy_sales_invoice", "legacy_sales_credit_note", "legacy_delivery_note", "fiscal_document", "custom"]);
function validGoodsImportEvidence(evidence: GoodsImportEvidence): boolean {
  return validText(evidence.declarationNumber, 128) && isRealDate(evidence.declaredAt) && isRealInstant(evidence.paidAt)
    && validText(evidence.paymentReference, 128)
    && validText(evidence.authority, 128) && validText(evidence.tariffCode, 32)
    && (evidence.reference === null || validText(evidence.reference, 128)) && validReliefEvidence(evidence.relief);
}
function validForeignServiceImportEvidence(evidence: ForeignServiceImportEvidence): boolean {
  return validText(evidence.invoiceReference, 128) && isRealDate(evidence.serviceDate) && isRealInstant(evidence.paidAt)
    && validText(evidence.paymentReference, 128)
    && /^[A-Z]{2}$/.test(evidence.providerCountryCode) && validReliefEvidence(evidence.relief);
}
function validReliefEvidence(evidence: ImportReliefEvidence | null): boolean {
  return evidence === null || (validText(evidence.legalInstrument, 200) && validText(evidence.certificateReference, 128) && isRealDate(evidence.issuedAt));
}
function validText(value: string, max: number): boolean { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function freezeFact(value: TaxReportingFact): TaxReportingFact { return Object.freeze({ ...value, counterpartyFiscalProfile: value.counterpartyFiscalProfile === null ? null : Object.freeze({ ...value.counterpartyFiscalProfile }), rateBreakdowns: Object.freeze([...value.rateBreakdowns]), signed: Object.freeze({ ...value.signed }), deductible: Object.freeze({ ...value.deductible }), importEvidence: value.importEvidence === null ? null : Object.freeze({ ...value.importEvidence, relief: value.importEvidence.relief === null ? null : Object.freeze({ ...value.importEvidence.relief }) }), reconciliation: Object.freeze({ ...value.reconciliation }) }); }
