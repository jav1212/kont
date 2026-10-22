import {
  companyMonetaryPolicySettings,
  type CompanyMonetaryPolicySettings,
  type CompanyMonetaryPolicy,
} from "./monetary-policy";
import type { CompanyDateFormat, CompanyDateOrder } from "./company-date-format";
import { companyFiscalAddress, companyTaxpayerType, type CompanyFiscalProfile, type CompanyTaxpayerType } from "./company-fiscal-profile";
import type { Company } from "./index";
import { CompanyFailure } from "./company-failure";

/** Typed company settings that can safely be copied without transferring legal identity or operational data. */
export type CompanyConfigurationCopySection = "operating_profile" | "date_format" | "monetary_policy" | "fiscal_profile";

/** Fiscal settings that may move between companies without transferring legal identity. */
export interface CompanyFiscalCopySettings {
  readonly fiscalAddress: string | null;
  readonly taxpayerType: CompanyTaxpayerType;
}

/** Immutable source configuration read while the source company is locked by an atomic persistence operation. */
export interface CompanyConfigurationCopySource {
  readonly company: Company;
  readonly dateFormat: CompanyDateFormat | null;
  readonly monetaryPolicy: CompanyMonetaryPolicy | null;
  readonly fiscalProfile: CompanyFiscalProfile | null;
}

/** Typed, identity-free configuration values derived from a source company. */
export interface CompanyConfigurationCopy {
  readonly operatingProfile?: Company["operatingProfile"];
  readonly dateOrder?: CompanyDateOrder;
  readonly monetaryPolicySettings?: CompanyMonetaryPolicySettings;
  readonly fiscalSettings?: CompanyFiscalCopySettings;
}

/**
 * Derives the selected typed configuration from a locked source snapshot.
 * Legal identity, tax identifiers, logos, lifecycle, document counters, and every operational record are deliberately absent from the result.
 * @param source - Company and currently configured typed sidecars read under the source lock.
 * @param sections - Non-empty unique list of configuration sections to transfer.
 * @returns A frozen identity-free configuration payload suitable only for an atomic destination write.
 * @throws {CompanyFailure} When a selected section has no source configuration or the selection is invalid.
 */
export function deriveCompanyConfigurationCopy(
  source: CompanyConfigurationCopySource,
  sections: readonly CompanyConfigurationCopySection[],
): CompanyConfigurationCopy {
  const selected = normalizeCompanyConfigurationCopySections(sections);
  const result: {
    operatingProfile?: Company["operatingProfile"];
    dateOrder?: CompanyDateOrder;
    monetaryPolicySettings?: CompanyMonetaryPolicySettings;
    fiscalSettings?: CompanyFiscalCopySettings;
  } = {};
  if (selected.includes("operating_profile")) result.operatingProfile = source.company.operatingProfile;
  if (selected.includes("date_format")) {
    if (!source.dateFormat) absent("date format");
    if (source.dateFormat.organizationId !== source.company.organizationId || source.dateFormat.companyId !== source.company.id) {
      invalid("The source date format belongs to another company.");
    }
    result.dateOrder = source.dateFormat.dateOrder;
  }
  if (selected.includes("monetary_policy")) {
    if (!source.monetaryPolicy) absent("monetary policy");
    if (source.monetaryPolicy.organizationId !== source.company.organizationId || source.monetaryPolicy.companyId !== source.company.id) {
      invalid("The source monetary policy belongs to another company.");
    }
    result.monetaryPolicySettings = companyMonetaryPolicySettings({
      operatingCurrencyCode: source.monetaryPolicy.operatingCurrency.code,
      operatingCurrencyMinorUnit: source.monetaryPolicy.operatingCurrency.minorUnit,
      referenceCurrencyCodes: source.monetaryPolicy.referenceCurrencies.map((currency) => currency.code),
      rateSource: source.monetaryPolicy.rateSource,
      roundingProfile: source.monetaryPolicy.roundingProfile,
      allowPreviousAvailableDate: source.monetaryPolicy.allowPreviousAvailableDate,
      maxPreviousDays: source.monetaryPolicy.maxPreviousDays,
    });
  }
  if (selected.includes("fiscal_profile")) {
    if (!source.fiscalProfile) absent("fiscal profile");
    if (source.fiscalProfile.companyId !== source.company.id || source.fiscalProfile.companyVersion !== source.company.version) {
      invalid("The source fiscal profile does not match the locked company revision.");
    }
    result.fiscalSettings = Object.freeze({
      fiscalAddress: companyFiscalAddress(source.fiscalProfile.fiscalAddress),
      taxpayerType: companyTaxpayerType(source.fiscalProfile.taxpayerType),
    });
  }
  return Object.freeze(result);
}

/**
 * Validates a configuration-copy selection before it is sent to a persistence transaction.
 * @param sections - Candidate selected configuration sections.
 * @returns A frozen deduplicated selection preserving its requested order.
 * @throws {CompanyFailure} When no section, a duplicate, or an unsupported section is supplied.
 */
export function normalizeCompanyConfigurationCopySections(
  sections: readonly CompanyConfigurationCopySection[],
): readonly CompanyConfigurationCopySection[] {
  if (!Array.isArray(sections) || sections.length === 0) invalid("At least one typed configuration section is required.");
  const allowed: readonly CompanyConfigurationCopySection[] = ["operating_profile", "date_format", "monetary_policy", "fiscal_profile"];
  const normalized = sections.map((section) => {
    if (!allowed.includes(section)) invalid("The configuration section is unsupported.");
    return section;
  });
  if (new Set(normalized).size !== normalized.length) invalid("Configuration sections must not be repeated.");
  return Object.freeze([...normalized]);
}

function absent(section: string): never {
  throw new CompanyFailure("COMPANY_CONFIGURATION_SOURCE_SETTINGS_ABSENT", `The source company has no ${section} configuration to copy.`);
}

function invalid(message: string): never {
  throw new CompanyFailure("COMPANY_CONFIGURATION_COPY_INVALID", message);
}
