import { CompanyFailure, companyId, companyVersion, type CompanyId, type CompanyPersonNature } from "./index";

/** Taxpayer classifications currently supported by the Venezuelan company record. */
export type CompanyTaxpayerType = "ordinario" | "especial";

/** Persisted fiscal context exposed without changing a company's legal identity. */
export interface CompanyFiscalProfileState {
  readonly companyId: CompanyId;
  readonly legalName: string;
  /** Historical RIF values are preserved as opaque values until their dedicated migration. */
  readonly taxId: string | null;
  /** Historical rows can remain unclassified while the dedicated identity case resolves them. */
  readonly personNature: CompanyPersonNature | null;
  readonly fiscalAddress: string | null;
  readonly taxpayerType: CompanyTaxpayerType;
  readonly companyVersion: number;
}

/** Immutable fiscal configuration and legal-identity context for one company. */
export class CompanyFiscalProfile {
  readonly companyId: CompanyId;
  readonly legalName: string;
  readonly taxId: string | null;
  readonly personNature: CompanyPersonNature | null;
  readonly fiscalAddress: string | null;
  readonly taxpayerType: CompanyTaxpayerType;
  readonly companyVersion: number;

  /**
   * Rehydrates the fiscal profile returned by the authoritative company record.
   * @param state - Profile data returned by a company-scoped persistence adapter.
   * @returns An immutable validated fiscal profile.
   * @throws {CompanyFailure} When a response contains malformed mutable fiscal data or scope.
   */
  constructor(state: CompanyFiscalProfileState) {
    this.companyId = companyId(state.companyId);
    this.legalName = legalName(state.legalName);
    this.taxId = legacyTaxId(state.taxId);
    this.personNature = personNature(state.personNature);
    this.fiscalAddress = companyFiscalAddress(state.fiscalAddress);
    this.taxpayerType = companyTaxpayerType(state.taxpayerType);
    this.companyVersion = companyVersion(state.companyVersion);
    Object.freeze(this);
  }
}

/**
 * Validates an optional fiscal address and returns its storage-safe trimmed form.
 * @param value - Address supplied by a caller or persistence adapter; null clears it.
 * @returns A nonempty address of at most 500 characters, or null.
 * @throws {CompanyFailure} When a non-null address is blank or too long.
 */
export function companyFiscalAddress(value: string | null): string | null {
  if (value === null) return null;
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 500 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new CompanyFailure("COMPANY_FISCAL_PROFILE_INVALID", "The fiscal address is invalid.");
  }
  return normalized;
}

/**
 * Validates a taxpayer classification without deriving it from legal identity.
 * @param value - Explicit classification selected for the company.
 * @returns The supported taxpayer type.
 * @throws {CompanyFailure} When the classification is not supported.
 */
export function companyTaxpayerType(value: unknown): CompanyTaxpayerType {
  if (value === "ordinario" || value === "especial") return value;
  throw new CompanyFailure("COMPANY_FISCAL_PROFILE_INVALID", "The taxpayer type is invalid.");
}

function legalName(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 255) {
    throw new CompanyFailure("COMPANY_FISCAL_PROFILE_INVALID", "The company legal name is invalid.");
  }
  return normalized;
}

function legacyTaxId(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new CompanyFailure("COMPANY_FISCAL_PROFILE_INVALID", "The company tax identifier is invalid.");
  }
  return value;
}

function personNature(value: unknown): CompanyPersonNature | null {
  if (value === null) return null;
  if (value === "natural" || value === "juridical") return value;
  throw new CompanyFailure("COMPANY_FISCAL_PROFILE_INVALID", "The company person nature is invalid.");
}
