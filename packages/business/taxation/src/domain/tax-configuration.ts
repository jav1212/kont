import type { CompanyId } from "@kontave/companies/domain";
import { TaxationFailure } from "./taxation-failure";

/** Stable IVA rate slots. Their legal rate is supplied only by a versioned rule. */
/** Legal category. It is distinct from Profit-compatible rate slots and never supplies a rate. */
export type TaxRuleCategory = "general" | "reduced" | "zero_rated" | "luxury_surcharge" | "payment_surcharge" | "other";

/** Optional display/selection slot retained for Profit compatibility; it has no legal rate semantics. */
export type LegacyRateSlot = "a1" | "a2" | "a3" | "a4" | "a5";

/** Commercial presentation selected for one operation, independently from legal rule history. */
export type TaxPriceMode = "tax_exclusive" | "tax_inclusive";

/** Explicit fiscal standing of a document counterparty. */
export type CounterpartyContributorStatus = "ordinary" | "formal" | "occasional" | "unverified";

/** Explicit residence classification of a document counterparty. */
export type CounterpartyResidenceStatus = "domestic" | "import_goods" | "foreign_service" | "unverified";

/** Legally distinct tax component. A component exists only when its rule is explicitly configured. */
export type TaxRuleComponent = "base" | "luxury" | "payment";

/** Versioned company-owned fiscal identity used when tax treatment depends on the counterparty. */
export interface TaxCounterpartyFiscalProfile {
  readonly companyId: CompanyId;
  readonly counterpartyId: string;
  readonly contributorStatus: CounterpartyContributorStatus;
  readonly residenceStatus: CounterpartyResidenceStatus;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly legalBasis: string;
  readonly evidenceReference: string;
  readonly version: number;
}

/** Validates a configurable IVA category without assigning it a legal rate. */
export function taxRuleCategory(value: string): TaxRuleCategory {
  const normalized = value.trim().toLowerCase();
  if (normalized === "general" || normalized === "reduced" || normalized === "zero_rated" || normalized === "luxury_surcharge" || normalized === "payment_surcharge" || normalized === "other") return normalized as TaxRuleCategory;
  throw new TaxationFailure("TAXATION_CATEGORY_INVALID", "Tax rate category is invalid.");
}

/** Validates a legacy slot without assigning it a legal category or tax rate. */
export function legacyRateSlot(value: string): LegacyRateSlot {
  const normalized = value.trim().toLowerCase();
  if (/^a[1-5]$/.test(normalized)) return normalized as LegacyRateSlot;
  throw new TaxationFailure("TAXATION_CATEGORY_INVALID", "Legacy tax rate slot is invalid.");
}

/** Validates the commercial tax-price mode for an operation. */
export function taxPriceMode(value: string): TaxPriceMode {
  if (value === "tax_exclusive" || value === "tax_inclusive") return value;
  throw new TaxationFailure("TAXATION_PRICE_MODE_INVALID", "Tax price mode is invalid.");
}

/** Validates a legal tax component without inferring a rate or eligibility. */
export function taxRuleComponent(value: string): TaxRuleComponent {
  if (value === "base" || value === "luxury" || value === "payment") return value;
  throw new TaxationFailure("TAXATION_RULE_INVALID", "Tax rule component is invalid.");
}

/** Validates a fiscal counterparty profile and preserves the supplied audit evidence. */
export function taxCounterpartyFiscalProfile(input: TaxCounterpartyFiscalProfile): TaxCounterpartyFiscalProfile {
  if (!input.counterpartyId.trim() || input.counterpartyId.trim().length > 128 || !input.legalBasis.trim()
    || !input.evidenceReference.trim() || !Number.isSafeInteger(input.version) || input.version < 0) {
    throw new TaxationFailure("TAXATION_COUNTERPARTY_PROFILE_INVALID", "Counterparty fiscal profile is invalid.");
  }
  if (!(["ordinary", "formal", "occasional", "unverified"] as const).includes(input.contributorStatus)
    || !(["domestic", "import_goods", "foreign_service", "unverified"] as const).includes(input.residenceStatus)) {
    throw new TaxationFailure("TAXATION_COUNTERPARTY_PROFILE_INVALID", "Counterparty fiscal classification is invalid.");
  }
  if (input.effectiveTo !== null && input.effectiveTo < input.effectiveFrom) {
    throw new TaxationFailure("TAXATION_COUNTERPARTY_PROFILE_INVALID", "Counterparty fiscal profile interval is invalid.");
  }
  return Object.freeze({ ...input, counterpartyId: input.counterpartyId.trim(), legalBasis: input.legalBasis.trim(), evidenceReference: input.evidenceReference.trim() });
}
