import { addMoney, currency, moneyFromDecimal, moneyFromMinor, sameCurrency, subtractMoney, type CurrencyDefinition, type Money } from "@kontave/monetary/domain";
import { TaxReportingFailure, type TaxReportingFact } from "../domain";
import { reviewLegacyVatSource, type LegacyVatSource } from "./legacy-source-review";
import type { LegacyVatSourceRecord } from "./legacy-vat-source";

/** Reviewed historical rate groups supplied from source documents or accountant evidence. */
export type LegacyVatReviewedRate = LegacyVatSource["historicalRateBreakdowns"][number];

/** Seed values that must come from an authorized company and an explicit review context. */
export type LegacyVatFactSeed = Omit<TaxReportingFact, "source" | "direction" | "documentKind" | "affectedSourceId" | "documentDate" | "currency" | "signed" | "rateBreakdowns" | "reconciliation" | "counterparty" | "withholding" | "importEvidence" | "counterpartyFiscalProfile"> & { readonly counterpartyFiscalProfile?: TaxReportingFact["counterpartyFiscalProfile"] };

/** Manual evidence needed to turn a raw legacy document into a reviewable, never auto-certified fact. */
export interface LegacyVatRecordReviewEvidence {
  readonly currency: CurrencyDefinition;
  /** Exempt base independently established from the source document; use zero only when verified zero. */
  readonly exemptBase: Money;
  /** Null means the historical exempt amount could not be verified. */
  readonly historicalExemptBase: Money | null;
  /** Classifications and rate groups explicitly reviewed against the source, never current rules. */
  readonly rates: readonly LegacyVatReviewedRate[];
  /**
   * Timestamp supported by the retention certificate or another reviewed source.
   * Required when the source document contains a non-zero VAT retention.
   */
  readonly withholdingOccurredAt?: string | null;
}

/**
 * Converts one raw legacy RPC result into a reconciled or review-required IVA fact.
 *
 * Header amounts and line evidence are copied as stored. The caller supplies the
 * historical legal classification and exempt-base evidence; this adapter never
 * resolves them from current configuration.
 *
 * @param record - Raw, company-scoped result from the read-only legacy bridge.
 * @param seed - Stable identity, owner scope, recognition period, counterparty and review provenance.
 * @param evidence - Currency precision and independently reviewed historical tax evidence.
 * @returns A valid fact whose reconciliation state blocks unsupported declaration use.
 * @throws {TaxReportingFailure} When the raw source cannot be represented exactly or belongs to an unsupported kind.
 */
export function reviewLegacyVatSourceRecord(
  record: LegacyVatSourceRecord,
  seed: LegacyVatFactSeed,
  evidence: LegacyVatRecordReviewEvidence,
): TaxReportingFact {
  const kind = legacyKind(record.kind);
  if (kind === "delivery_note") {
    throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Delivery notes cannot become IVA facts.");
  }
  const headerCurrency = record.header.currency;
  if (typeof headerCurrency !== "string" || currencyCode(headerCurrency, evidence.currency) !== evidence.currency.code) {
    throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Legacy document currency is absent or differs from reviewed money evidence.");
  }
  if (record.documentDate === null || !/^\d{4}-\d{2}-\d{2}$/.test(record.documentDate)) {
    throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Legacy document date is missing or invalid and cannot be booked by recognition date substitution.");
  }
  if (!sameCurrency(evidence.exemptBase.currency, evidence.currency)
    || (evidence.historicalExemptBase !== null && !sameCurrency(evidence.historicalExemptBase.currency, evidence.currency))) {
    throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Reviewed exempt amounts use another currency.");
  }

  const headerSubtotal = headerMoney(record, "subtotal", evidence.currency);
  const headerTax = headerMoney(record, "taxAmount", evidence.currency);
  const headerTotal = headerMoney(record, "total", evidence.currency);
  const lineTax = sumLineMoney(record, "taxAmount", evidence.currency);
  const lineBase = sumLineMoney(record, "base", evidence.currency);
  const lineTotal = sumLineMoney(record, "net", evidence.currency);
  const lineEvidenceComplete = record.lines.length > 0
    && record.lines.every((line) => line.taxAmount !== null && line.base !== null && line.net !== null);
  const withholding = historicalWithholding(record, evidence, kind, headerCurrency);

  return reviewLegacyVatSource({
    id: record.id,
    kind,
    affectedSourceId: record.affectedId,
    lineCount: record.lines.length,
    headerTax,
    headerTaxableBase: subtractMoney(headerSubtotal, evidence.exemptBase),
    headerExemptBase: evidence.exemptBase,
    headerTotal,
    lineTax: lineTax ?? moneyFromMinor(0n, evidence.currency),
    lineTaxableBase: lineBase ?? moneyFromMinor(0n, evidence.currency),
    lineTotal: lineTotal ?? moneyFromMinor(0n, evidence.currency),
    lineEvidenceComplete,
    historicalExemptBase: evidence.historicalExemptBase,
    historicalRateBreakdowns: evidence.rates,
    documentDate: record.documentDate,
  }, {
    ...seed,
    counterparty: {
      taxIdentifier: record.header.counterpartyTaxId?.trim() || null,
      name: record.header.counterpartyName?.trim() || null,
      countryCode: null,
    },
    withholding,
    importEvidence: null,
    currency: evidence.currency,
    direction: kind.startsWith("purchase") ? "purchase" : "sale",
    documentKind: kind === "purchase_credit_note" || kind === "sales_credit_note" ? "credit_note" : kind === "purchase_debit_note" ? "debit_note" : "invoice",
    documentDate: record.documentDate,
  });
}

function historicalWithholding(
  record: LegacyVatSourceRecord,
  evidence: LegacyVatRecordReviewEvidence,
  kind: LegacyVatSource["kind"],
  sourceCurrency: string,
): TaxReportingFact["withholding"] {
  const amountText = record.header.withheldAmount;
  if (amountText === undefined || amountText === null) {
    throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Legacy source is missing its VAT withholding amount snapshot.");
  }
  let amount: Money;
  try {
    amount = moneyFromDecimal(amountText, evidence.currency);
  } catch (cause) {
    throw new TaxReportingFailure("TAX_REPORTING_INVALID", `Legacy VAT withholding amount is invalid: ${String(cause)}`);
  }
  if (amount.minorAmount === 0n) return null;
  const certificateReference = record.header.withholdingCertificate?.trim();
  if (!certificateReference || !evidence.withholdingOccurredAt) {
    throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Non-zero legacy VAT withholding requires its certificate and reviewed occurrence timestamp.");
  }
  const occurredAt = evidence.withholdingOccurredAt;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(occurredAt) || !Number.isFinite(Date.parse(occurredAt))) {
    throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Reviewed withholding occurrence timestamp is invalid.");
  }
  if (currencyCode(sourceCurrency, evidence.currency) !== evidence.currency.code) {
    throw new TaxReportingFailure("TAX_REPORTING_INVALID", "VAT withholding currency differs from the reviewed source currency.");
  }
  return {
    kind: kind.startsWith("purchase") ? "practiced" : "suffered",
    amount,
    certificateReference,
    occurredAt,
  };
}

function currencyCode(value: string, definition: CurrencyDefinition): string {
  try {
    return currency(value, definition.minorUnit).code;
  } catch (cause) {
    throw new TaxReportingFailure("TAX_REPORTING_INVALID", `Legacy document currency is invalid: ${String(cause)}`);
  }
}

function headerMoney(record: LegacyVatSourceRecord, key: string, definition: CurrencyDefinition): Money {
  const value = record.header[key];
  if (typeof value !== "string") throw new TaxReportingFailure("TAX_REPORTING_INVALID", `Legacy document is missing header ${key}.`);
  try {
    return moneyFromDecimal(value, definition);
  } catch (cause) {
    throw new TaxReportingFailure("TAX_REPORTING_INVALID", `Legacy document header ${key} is not exact money: ${String(cause)}`);
  }
}

function sumLineMoney(record: LegacyVatSourceRecord, field: "base" | "net" | "taxAmount", definition: CurrencyDefinition): Money | null {
  if (record.lines.length === 0 || record.lines.some((line) => line[field] === null)) return null;
  try {
    return record.lines
      .map((line) => moneyFromDecimal(line[field]!, definition))
      .reduce((total, amount) => addMoney(total, amount), moneyFromMinor(0n, definition));
  } catch (cause) {
    throw new TaxReportingFailure("TAX_REPORTING_INVALID", `Legacy line ${field} contains an invalid amount: ${String(cause)}`);
  }
}

function legacyKind(kind: string): LegacyVatSource["kind"] {
  switch (kind) {
    case "purchase_invoice": return "purchase_invoice";
    case "purchase_credit_note": return "purchase_credit_note";
    case "purchase_debit_note": return "purchase_debit_note";
    case "sales_invoice": return "sales_invoice";
    case "sales_credit_note": return "sales_credit_note";
    case "delivery_note": return "delivery_note";
    default: throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Unsupported legacy document kind cannot be posted to IVA books.");
  }
}
