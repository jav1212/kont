import type { OrganizationId } from "@kontave/organizations/domain";
import { CompanyFailure, companyId, companyVersion, type CompanyId } from "./index";

/** Canonical slot for a secondary tax identifier. */
export interface SecondaryTaxIdentifierKey {
  readonly jurisdiction: string;
  readonly scheme: string;
}

/** Persisted company tax identifier outside the primary Venezuelan RIF field. */
export interface CompanySecondaryTaxIdentifierState extends SecondaryTaxIdentifierKey {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly value: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Immutable, versioned additional tax identity for one company and jurisdiction. */
export class CompanySecondaryTaxIdentifier {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly jurisdiction: string;
  readonly scheme: string;
  readonly value: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;

  /**
   * Rehydrates a persisted secondary identifier without asserting that its authority considers it legally valid.
   * @param state - Authoritative identifier snapshot.
   * @returns An immutable validated identifier.
   * @throws {CompanyFailure} When scope, slot, value, revision or timestamps are malformed.
   */
  constructor(state: CompanySecondaryTaxIdentifierState) {
    if (!state.id || state.id.length > 128) throw invalidIdentifier();
    this.id = state.id;
    this.organizationId = state.organizationId;
    this.companyId = companyId(state.companyId);
    this.jurisdiction = secondaryTaxJurisdiction(state.jurisdiction);
    this.scheme = secondaryTaxIdentifierScheme(state.scheme);
    this.value = secondaryTaxIdentifierValue(state.value);
    this.version = companyVersion(state.version);
    this.createdAt = timestamp(state.createdAt);
    this.updatedAt = timestamp(state.updatedAt);
    Object.freeze(this);
  }
}

/**
 * Validates a jurisdiction code's portable ISO alpha-2 shape.
 * This checks syntax only and does not certify membership in the ISO catalog.
 * @param value - Two-letter jurisdiction code.
 * @returns Uppercase jurisdiction code.
 * @throws {CompanyFailure} When the input is not two ASCII letters.
 */
export function secondaryTaxJurisdiction(value: string): string {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(normalized)) throw invalidIdentifier();
  return normalized;
}

/**
 * Validates a stable identifier scheme key without embedding jurisdiction-specific legal rules.
 * @param value - Module-defined scheme key such as `vat` or `foreign_tax_id`.
 * @returns Lowercase stable scheme key.
 * @throws {CompanyFailure} When the scheme key is malformed.
 */
export function secondaryTaxIdentifierScheme(value: string): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z][a-z0-9._-]{0,63}$/.test(normalized)) throw invalidIdentifier();
  return normalized;
}

/**
 * Validates and trims a secondary identifier while preserving its case and internal formatting.
 * @param value - Identifier assigned by its issuing jurisdiction.
 * @returns The trimmed identifier value.
 * @throws {CompanyFailure} When the value is empty, too long or contains control characters.
 */
export function secondaryTaxIdentifierValue(value: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 128 || /[\u0000-\u001f\u007f]/.test(normalized)) throw invalidIdentifier();
  return normalized;
}

function timestamp(value: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw invalidIdentifier();
  return value;
}

function invalidIdentifier(): CompanyFailure {
  return new CompanyFailure("COMPANY_SECONDARY_TAX_IDENTIFIER_INVALID", "The secondary tax identifier is invalid.");
}
