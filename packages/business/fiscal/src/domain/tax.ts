import { compareDecimal, exactDecimal, sameCurrency, type ExactDecimal, type Money } from "@kontave/monetary/domain";
import type { FiscalDocumentLineId } from "./identifiers";
import { FiscalFailure } from "./fiscal-failure";
import { fiscalDate, type FiscalDate } from "./temporal";

export type FiscalTaxCategory = "taxable" | "zero_rated" | "exempt" | "exonerated" | "not_subject" | "perceived" | "other";
export type FiscalTaxCalculationMode = "tax_exclusive" | "tax_inclusive";
export type FiscalTaxComponent = "base" | "luxury" | "payment";
export type FiscalTaxCategoryCode = "general" | "reduced" | "zero_rated" | "luxury_surcharge" | "payment_surcharge" | "other";
export type FiscalTaxSource =
  | { readonly kind: "line"; readonly lineId: FiscalDocumentLineId }
  | { readonly kind: "document" }
  | { readonly kind: "payment"; readonly paymentKey: string };

export interface FiscalTaxDetermination {
  readonly taxCode: string;
  readonly category: FiscalTaxCategory;
  /**
   * @deprecated Use `taxCategory` plus `legacyRateSlot` for new snapshots.
   * Compatibility field for historical fiscal payloads that combined selectors.
   */
  readonly rateCategory?: string | null;
  /** Legal tax-rule category selected for this determination. */
  readonly taxCategory?: FiscalTaxCategoryCode | null;
  /** Historical Profit Plus A1–A5 slot; it carries no legal rate semantics. */
  readonly legacyRateSlot?: "a1" | "a2" | "a3" | "a4" | "a5" | null;
  /** Legal tax component, including surcharges with a different legal basis. */
  readonly component?: FiscalTaxComponent;
  readonly calculationMode: FiscalTaxCalculationMode;
  readonly rate: ExactDecimal;
  readonly taxableBase: Money;
  readonly amount: Money;
  readonly jurisdiction: string;
  readonly ruleVersion: string;
  /** Commercial operation date used when resolving this historical tax result. */
  readonly operationDate?: FiscalDate;
  /** Legal basis of the effective legal tax rule. */
  readonly legalBasis?: string;
  /** Version of the company-owned tax classification selected for the operation. */
  readonly classificationVersion?: string;
  /** Legal basis of the company-owned tax classification selected for the operation. */
  readonly classificationLegalBasis?: string;
  readonly source: FiscalTaxSource;
}

export interface FiscalTaxSummary {
  readonly taxCode: string;
  readonly category: FiscalTaxCategory;
  /** @deprecated Compatibility field for historical fiscal payloads. */
  readonly rateCategory?: string | null;
  readonly taxCategory?: FiscalTaxCategoryCode | null;
  readonly legacyRateSlot?: "a1" | "a2" | "a3" | "a4" | "a5" | null;
  readonly component?: FiscalTaxComponent;
  readonly calculationMode: FiscalTaxCalculationMode;
  readonly rate: ExactDecimal;
  readonly taxableBase: Money;
  readonly amount: Money;
}

/**
 * Validates and normalizes a versioned tax determination captured by a fiscal document.
 *
 * @param input - Tax result, provenance, and monetary basis to preserve.
 * @returns A normalized tax determination snapshot.
 * @throws {@link FiscalFailure} When tax values, currency, category, or provenance are invalid.
 */
export function fiscalTaxDetermination(input: FiscalTaxDetermination): FiscalTaxDetermination {
  const taxCode = required(input.taxCode, 64, "tax code").toUpperCase();
  const jurisdiction = required(input.jurisdiction, 16, "jurisdiction").toUpperCase();
  const ruleVersion = required(input.ruleVersion, 128, "rule version");
  const rate = exactDecimal(input.rate);
  if (compareDecimal(rate, exactDecimal("0")) < 0 || input.taxableBase.minorAmount < 0n || input.amount.minorAmount < 0n) {
    throw new FiscalFailure("FISCAL_TAX_INVALID", "Fiscal tax values cannot be negative.");
  }
  if (!sameCurrency(input.taxableBase.currency, input.amount.currency)) {
    throw new FiscalFailure("FISCAL_CURRENCY_MISMATCH", "Tax base and amount must use the same currency.");
  }
  if (["zero_rated", "exempt", "exonerated", "not_subject"].includes(input.category) && (input.amount.minorAmount !== 0n || rate !== "0")) {
    throw new FiscalFailure("FISCAL_TAX_INVALID", "Untaxed fiscal determinations require a zero rate and amount.");
  }
  if (input.rateCategory !== undefined && input.rateCategory !== null && !/^(general|a[1-5])$/.test(input.rateCategory)) {
    throw new FiscalFailure("FISCAL_TAX_INVALID", "Fiscal tax rate category is invalid.");
  }
  if (input.taxCategory !== undefined && input.taxCategory !== null && !["general", "reduced", "zero_rated", "luxury_surcharge", "payment_surcharge", "other"].includes(input.taxCategory)) {
    throw new FiscalFailure("FISCAL_TAX_INVALID", "Fiscal tax category is invalid.");
  }
  if (input.legacyRateSlot !== undefined && input.legacyRateSlot !== null && !/^a[1-5]$/.test(input.legacyRateSlot)) {
    throw new FiscalFailure("FISCAL_TAX_INVALID", "Fiscal legacy rate slot is invalid.");
  }
  if (input.component !== undefined && !["base", "luxury", "payment"].includes(input.component)) {
    throw new FiscalFailure("FISCAL_TAX_INVALID", "Fiscal tax component is invalid.");
  }
  if (input.source.kind === "payment" && !input.source.paymentKey.trim()) {
    throw new FiscalFailure("FISCAL_TAX_INVALID", "Payment tax source requires a payment key.");
  }
  const auditEvidence = {
    ...(input.operationDate === undefined ? {} : { operationDate: fiscalDate(input.operationDate) }),
    ...optionalAuditProperty("legalBasis", input.legalBasis, 500, "legal basis"),
    ...optionalAuditProperty("classificationVersion", input.classificationVersion, 128, "classification version"),
    ...optionalAuditProperty("classificationLegalBasis", input.classificationLegalBasis, 500, "classification legal basis"),
  };
  return {
    ...input,
    taxCode,
    jurisdiction,
    ruleVersion,
    rate,
    ...auditEvidence,
  };
}

function required(value: string, limit: number, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > limit) throw new FiscalFailure("FISCAL_TAX_INVALID", `Fiscal ${name} is invalid.`);
  return normalized;
}

function optionalAuditProperty<Key extends "legalBasis" | "classificationVersion" | "classificationLegalBasis">(
  key: Key,
  value: string | undefined,
  limit: number,
  name: string,
): Partial<Pick<FiscalTaxDetermination, Key>> {
  return value === undefined ? {} : { [key]: required(value, limit, name) } as Pick<FiscalTaxDetermination, Key>;
}
