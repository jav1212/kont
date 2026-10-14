import type { CompanyId } from "@kontave/companies/domain";
import {
  taxCounterpartyFiscalProfile,
  taxPriceMode,
  taxRuleCategory,
  taxRule,
  rangesOverlap,
  TaxationFailure,
  type CounterpartyContributorStatus,
  type CounterpartyResidenceStatus,
  type TaxCounterpartyFiscalProfile,
  type TaxPriceMode,
  type TaxRuleCategory,
  type TaxRule,
} from "../domain";
import type { TaxationContext } from "./index";

/** Company-scoped legal rule catalogue, versioned as one administrative resource. */
export interface CompanyTaxRuleCatalog {
  readonly companyId: CompanyId;
  readonly version: number;
  readonly rules: readonly TaxRule[];
}

/** Command that atomically replaces the authorized company IVA rule catalogue. */
export interface SaveCompanyTaxRuleCatalogInput extends TaxationContext {
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly rules: readonly TaxRule[];
}

/** Command that records explicit counterparty fiscal classifications and provenance. */
export interface SaveTaxCounterpartyFiscalProfileInput extends TaxationContext {
  readonly counterpartyId: string;
  readonly contributorStatus: CounterpartyContributorStatus;
  readonly residenceStatus: CounterpartyResidenceStatus;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly legalBasis: string;
  readonly evidenceReference: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

/** Value supplied by an operation to override the stored presentation mode. */
export interface TaxOperationPresentation {
  readonly priceMode: TaxPriceMode;
  readonly category: TaxRuleCategory | null;
}

/** Tenant-scoped persistence port for authorized IVA configuration administration. */
export interface TaxationConfigurationRepository {
  /** @param context - Authorized organization and company scope. @returns The versioned catalogue. */
  getCompanyTaxRuleCatalog(context: TaxationContext, catalogVersion?: number): Promise<CompanyTaxRuleCatalog>;
  /** @param input - Authorized optimistic, idempotent catalogue replacement. @returns Persisted catalogue. */
  saveCompanyTaxRuleCatalog(input: SaveCompanyTaxRuleCatalogInput): Promise<CompanyTaxRuleCatalog>;
  /** @param context - Authorized organization and company scope. @param counterpartyId - Commercial counterparty identity. @param effectiveDate - Operation date. @returns Effective profile or null. */
  getCounterpartyFiscalProfile(context: TaxationContext, counterpartyId: string, effectiveDate: string): Promise<TaxCounterpartyFiscalProfile | null>;
  /** @param input - Authorized optimistic, idempotent fiscal profile save. @returns Persisted profile. */
  saveCounterpartyFiscalProfile(input: SaveTaxCounterpartyFiscalProfileInput): Promise<TaxCounterpartyFiscalProfile>;
}

/** Owns IVA configuration administration and validates its concurrency/idempotency boundary. */
export class ManageTaxationConfiguration {
  /** @param repository - Tenant-scoped authorized taxation configuration port. */
  constructor(private readonly repository: TaxationConfigurationRepository) {}

  /** @param context - Authorized actor and company scope. @returns The current company catalogue. @throws {TaxationFailure} When persistence fails. */
  async getCompanyTaxRuleCatalog(context: TaxationContext, catalogVersion?: number): Promise<CompanyTaxRuleCatalog> {
    if (catalogVersion !== undefined && (!Number.isSafeInteger(catalogVersion) || catalogVersion < 0)) throw new TaxationFailure("TAXATION_PROFILE_INVALID", "Catalog version is invalid.");
    return this.call(() => this.repository.getCompanyTaxRuleCatalog(context, catalogVersion));
  }

  /** @param input - Full authorized catalogue replacement. @returns The persisted version. @throws {TaxationFailure} When command data or concurrency is invalid. */
  async saveCompanyTaxRuleCatalog(input: SaveCompanyTaxRuleCatalogInput): Promise<CompanyTaxRuleCatalog> {
    validateVersionAndKey(input.expectedVersion, input.idempotencyKey);
    const rules = validateCatalogRules(input.rules);
    return this.call(() => this.repository.saveCompanyTaxRuleCatalog({ ...input, rules }));
  }

  /** @param context - Authorized actor and company scope. @param counterpartyId - Commercial counterparty identity. @param effectiveDate - Operation date. @returns The explicit fiscal profile or null. @throws {TaxationFailure} When input or persistence is invalid. */
  async getCounterpartyFiscalProfile(context: TaxationContext, counterpartyId: string, effectiveDate: string): Promise<TaxCounterpartyFiscalProfile | null> {
    if (!counterpartyId.trim()) throw new TaxationFailure("TAXATION_COUNTERPARTY_PROFILE_INVALID", "Counterparty identifier is required.");
    return this.call(() => this.repository.getCounterpartyFiscalProfile(context, counterpartyId.trim(), effectiveDate));
  }

  /** @param input - Explicit profile, audit evidence, expected version, and idempotency key. @returns The persisted profile. @throws {TaxationFailure} When input or persistence is invalid. */
  async saveCounterpartyFiscalProfile(input: SaveTaxCounterpartyFiscalProfileInput): Promise<TaxCounterpartyFiscalProfile> {
    validateVersionAndKey(input.expectedVersion, input.idempotencyKey);
    taxCounterpartyFiscalProfile({ ...input, companyId: input.companyId, version: input.expectedVersion });
    return this.call(() => this.repository.saveCounterpartyFiscalProfile(input));
  }

  /** @param input - Operation-supplied category and presentation. @returns Validated presentation without silently using a legal default. @throws {TaxationFailure} When category or mode is invalid. */
  operationPresentation(input: TaxOperationPresentation): TaxOperationPresentation {
    return Object.freeze({ priceMode: taxPriceMode(input.priceMode), category: input.category === null ? null : taxRuleCategory(input.category) });
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); } catch (cause: unknown) {
      if (cause instanceof TaxationFailure) throw cause;
      throw new TaxationFailure("TAXATION_REPOSITORY_UNAVAILABLE", "Taxation configuration repository is unavailable.", { cause });
    }
  }
}

function validateVersionAndKey(expectedVersion: number, idempotencyKey: string): void {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new TaxationFailure("TAXATION_VERSION_CONFLICT", "Expected taxation configuration version is invalid.");
  if (!idempotencyKey.trim() || idempotencyKey.trim().length > 128) throw new TaxationFailure("TAXATION_IDEMPOTENCY_INVALID", "Taxation configuration idempotency key is invalid.");
}

function validateCatalogRules(input: readonly TaxRule[]): readonly TaxRule[] {
  const rules = input.map(taxRule);
  for (let index = 0; index < rules.length; index += 1) {
    const current = rules[index];
    if (current === undefined) continue;
    if (current.category === null) throw new TaxationFailure("TAXATION_RULE_INVALID", "Company tax catalogue rules require a legal category.");
    for (const candidate of rules.slice(index + 1)) {
      if (current.taxCode === candidate.taxCode && current.treatment === candidate.treatment
        && current.jurisdiction === candidate.jurisdiction && current.category === candidate.category
        && (current.legacyRateSlot === null || candidate.legacyRateSlot === null || current.legacyRateSlot === candidate.legacyRateSlot) && current.component === candidate.component
        && rangesOverlap(current.effectiveFrom, current.effectiveTo, candidate.effectiveFrom, candidate.effectiveTo)) {
        throw new TaxationFailure("TAXATION_RULE_AMBIGUOUS", "Company tax catalogue contains overlapping rules for one selector.");
      }
    }
  }
  return Object.freeze(rules);
}
