import type { FiscalDocument } from "@kontave/fiscal/domain";
import { addMoney, moneyFromMinor, type Money } from "@kontave/monetary/domain";
import type { TaxCounterpartyFiscalProfile } from "@kontave/taxation/domain";
import { TaxReportingFailure, taxReportingFact, type TaxReportingFact } from "../domain";

/** Explicit review inputs needed to place a fiscal snapshot in the correct book and period. */
export interface FiscalDocumentFactMetadata {
  readonly factId: string;
  /** Stable cross-source key shared with any legacy row for the same commercial document. */
  readonly lineageKey: string;
  readonly recognitionDate: string;
  readonly counterpartyCountryCode: string | null;
  /** Company-owned classification effective for the source document, when reviewed. */
  readonly counterpartyFiscalProfile?: TaxCounterpartyFiscalProfile | null;
  readonly deductible?: { readonly state: "eligible" | "ineligible" | "pending_review"; readonly amount: Money; readonly reason: string | null };
  readonly withholding: { readonly kind: "practiced" | "suffered"; readonly amount: Money; readonly certificateReference: string | null; readonly occurredAt: string } | null;
  readonly affectedFactId: string | null;
  readonly recordedAt: string;
}

/**
 * Converts an issued or received fiscal snapshot into a source-traceable VAT fact.
 *
 * This mapper preserves stored IVA determinations and never resolves current tax rules.
 * It leaves facts in review when classification, counterparty country, or purchase-credit
 * evidence is incomplete. Import declarations use a separate customs-fact workflow.
 *
 * @param document - Validated immutable fiscal document.
 * @param scope - Tenant, organization, and company that own the document.
 * @param metadata - Stable lineage and evidence not carried by the fiscal aggregate.
 * @returns Historical tax fact with correction signs applied exactly once.
 * @throws {TaxReportingFailure} When the source lifecycle, scope, date, currency, or correction link is invalid.
 */
export function fiscalDocumentTaxFact(
  document: FiscalDocument,
  scope: TaxReportingFact["scope"],
  metadata: FiscalDocumentFactMetadata,
): TaxReportingFact {
  if (document.companyId !== scope.companyId || document.status !== (document.direction === "issued" ? "issued" : "received")
    || document.number === null || document.issueDate === null || document.issuedAt === null) {
    invalid("Only a finalized fiscal document in the requested company can become a reporting fact.");
  }
  return mapFiscalDocumentTaxFact(document, scope, metadata, document.issueDate);
}

/**
 * Prepares the sales fact snapshot used by the atomic native-series issuance command.
 * The RPC supplies the final document number while committing the draft; the fact does
 * not include that number, so this mapper only requires the already validated draft tax snapshot.
 * @param draft - Complete outbound invoice draft with saved tax determinations.
 * @param scope - Tenant, organization, and company that own the invoice.
 * @param metadata - Stable fact lineage and review evidence.
 * @param issueDate - Commercial issue date verified against the sales invoice by persistence.
 * @returns Historical sales fact to commit with the numbered fiscal document.
 * @throws {TaxReportingFailure} When the draft is not an outbound invoice or its fact evidence is invalid.
 */
export function fiscalDocumentTaxFactForSalesSeriesIssue(
  draft: FiscalDocument,
  scope: TaxReportingFact["scope"],
  metadata: FiscalDocumentFactMetadata,
  issueDate: string,
): TaxReportingFact {
  if (draft.companyId !== scope.companyId || draft.status !== "draft" || draft.direction !== "issued"
    || draft.type !== "invoice" || draft.number !== null || draft.issuedAt !== null || draft.affectedDocument !== null
    || !validDate(issueDate)) {
    invalid("A native sales-series fact requires an unissued invoice draft in the requested company and a valid issue date.");
  }
  return mapFiscalDocumentTaxFact(draft, scope, metadata, issueDate);
}

function mapFiscalDocumentTaxFact(
  document: FiscalDocument,
  scope: TaxReportingFact["scope"],
  metadata: FiscalDocumentFactMetadata,
  documentDate: string,
): TaxReportingFact {
  if (!validDate(metadata.recognitionDate) || !validInstant(metadata.recordedAt) || !metadata.factId.trim() || !metadata.lineageKey.trim()) {
    invalid("Reporting identity and recognition evidence are incomplete.");
  }
  if (metadata.counterpartyCountryCode !== null && !/^[A-Za-z]{2}$/.test(metadata.counterpartyCountryCode)) {
    invalid("Counterparty country must be an explicit ISO alpha-2 code or null.");
  }

  const correction = document.type === "credit_note" || document.type === "debit_note";
  if (correction && (metadata.affectedFactId === null || document.affectedDocument?.internalDocumentId === null)) invalid("Fiscal corrections must link to the affected reporting fact and internal source document.");
  if (!correction && metadata.affectedFactId !== null) invalid("An invoice cannot link to an affected reporting fact.");
  if (document.affectedDocument !== null && metadata.affectedFactId === null) invalid("Fiscal correction linkage cannot be inferred from a fiscal number alone.");

  const direction = document.direction === "issued" ? "sale" : "purchase";
  const sign = document.type === "credit_note" ? -1n : 1n;
  const iva = document.taxDeterminations.filter((item) => item.taxCode.toUpperCase() === "IVA");
  const zero = moneyFromMinor(0n, document.documentCurrency);
  let taxableBase = zero;
  let exemptBase = zero;
  let taxAmount = zero;
  const rateBreakdowns: TaxReportingFact["rateBreakdowns"][number][] = [];
  const reviewReasons: string[] = [];

  if (iva.length === 0) reviewReasons.push("IVA_DETERMINATION_MISSING");
  for (const determination of iva) {
    const category = toReportingCategory(determination.category);
    const component = determination.component ?? "base";
    const base = signed(determination.taxableBase, sign);
    const tax = signed(determination.amount, sign);
    if (category === "unknown") reviewReasons.push("IVA_CLASSIFICATION_REVIEW_REQUIRED");
    if (component === "base") {
      if (category === "exempt" || category === "exonerated" || category === "non_subject") exemptBase = addMoney(exemptBase, base);
      else taxableBase = addMoney(taxableBase, base);
    }
    taxAmount = addMoney(taxAmount, tax);
    rateBreakdowns.push({ rate: determination.rate, category, taxableBase: base, taxAmount: tax, ruleVersion: determination.ruleVersion, component });
  }

  if (metadata.counterpartyCountryCode === null) reviewReasons.push("COUNTERPARTY_COUNTRY_REVIEW_REQUIRED");
  if (direction === "purchase" && metadata.counterpartyFiscalProfile == null) reviewReasons.push("COUNTERPARTY_FISCAL_PROFILE_REVIEW_REQUIRED");
  if (direction === "purchase" && metadata.counterpartyFiscalProfile?.contributorStatus === "unverified") reviewReasons.push("COUNTERPARTY_FISCAL_STATUS_UNVERIFIED");
  if (direction === "purchase" && metadata.counterpartyFiscalProfile?.residenceStatus === "unverified") reviewReasons.push("COUNTERPARTY_RESIDENCE_UNVERIFIED");
  let deductible: TaxReportingFact["deductible"];
  if (direction === "sale") {
    if (metadata.deductible?.amount.minorAmount !== undefined && metadata.deductible.amount.minorAmount !== 0n) {
      invalid("Sales facts cannot claim deductible input tax.");
    }
    deductible = { state: "ineligible", amount: zero, reason: null };
  } else if (metadata.deductible === undefined) {
    reviewReasons.push("PURCHASE_CREDIT_REVIEW_REQUIRED");
    deductible = { state: "pending_review", amount: zero, reason: "PURCHASE_CREDIT_REVIEW_REQUIRED" };
  } else if (reviewReasons.length > 0) {
    deductible = { state: "pending_review", amount: zero, reason: reviewReasons.join(";") };
  } else {
    deductible = { ...metadata.deductible, amount: signed(metadata.deductible.amount, sign) };
  }

  const counterparty = document.direction === "issued" ? document.recipient : document.issuer;
  const documentKind = document.type === "credit_note" ? "credit_note" : document.type === "debit_note" ? "debit_note" : "invoice";
  const fact = taxReportingFact({
    id: metadata.factId,
    scope,
    source: { kind: "fiscal_document", id: document.id, lineageKey: metadata.lineageKey },
    direction,
    documentKind,
    documentDate,
    recognitionDate: metadata.recognitionDate,
    period: metadata.recognitionDate.slice(0, 7),
    counterparty: { taxIdentifier: counterparty.taxIdentifier, name: counterparty.legalName, countryCode: metadata.counterpartyCountryCode?.toUpperCase() ?? null },
    counterpartyFiscalProfile: metadata.counterpartyFiscalProfile ?? null,
    currency: document.documentCurrency,
    signed: {
      taxableBase,
      taxAmount,
      exemptBase,
      total: signed(document.totals.payableAmount, sign),
    },
    rateBreakdowns,
    affectedFactId: metadata.affectedFactId,
    affectedSourceId: document.affectedDocument?.internalDocumentId ?? null,
    deductible,
    withholding: metadata.withholding === null ? null : { ...metadata.withholding, amount: signed(metadata.withholding.amount, sign) },
    importEvidence: null,
    reconciliation: { state: reviewReasons.length === 0 ? "reconciled" : "issue", reason: reviewReasons.join(";") || null, expectedTaxAmount: null },
    recordedAt: metadata.recordedAt,
  });
  return fact;
}

function toReportingCategory(category: FiscalDocument["taxDeterminations"][number]["category"]): TaxReportingFact["rateBreakdowns"][number]["category"] {
  if (category === "taxable") return "taxable";
  if (category === "zero_rated") return "zero_rated";
  if (category === "exempt") return "exempt";
  if (category === "exonerated") return "exonerated";
  if (category === "not_subject") return "non_subject";
  return "unknown";
}

function signed(amount: Money, sign: bigint): Money {
  return moneyFromMinor(amount.minorAmount * sign, amount.currency);
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

function validInstant(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function invalid(message: string): never {
  throw new TaxReportingFailure("TAX_REPORTING_INVALID", message);
}
