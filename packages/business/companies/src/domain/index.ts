import type { OrganizationId } from "@kontave/organizations/domain";
import { companyLogoUrl } from "./company-logo";
import { CompanyFailure } from "./company-failure";

export * from "./monetary-policy";
export * from "./company-date-format";
export * from "./company-logo";
export * from "./company-branch";
export * from "./company-branch-connectivity";
export * from "./secondary-tax-identifier";
export * from "./document-numbering-series";
export * from "./company-configuration-copy";
export * from "./company-fiscal-profile";
export { CompanyFailure } from "./company-failure";

declare const companyIdBrand: unique symbol;
declare const taxIdBrand: unique symbol;
export type CompanyId = string & { readonly [companyIdBrand]: true };
export type TaxId = string & { readonly [taxIdBrand]: true };

export enum CompanyStatus {
  Active = "active",
  Suspended = "suspended",
  Archived = "archived",
}

export enum CompanyCountry {
  Venezuela = "VE",
}
export type CompanyOperatingProfile = "standard" | "kiosk";

/** Civil-law nature accepted for a company's represented taxpayer. */
export type CompanyPersonNature = "natural" | "juridical";

/**
 * Validates the bounded civil-law person nature used by company administration.
 * @param value - Untrusted domain or persistence value.
 * @returns The validated person nature.
 * @throws {CompanyFailure} When the value is not `natural` or `juridical`.
 */
export function companyPersonNature(value: unknown): CompanyPersonNature {
  if (value === "natural" || value === "juridical") return value;
  throw new CompanyFailure("COMPANY_INVALID", "The company person nature is invalid.");
}

/** Document series backed by the company's existing transactional counters. */
export type CompanyDocumentSeries = "sales_invoice" | "delivery_note";

/** Next document identifiers persisted for one company. */
export interface CompanyDocumentNumberingSettings {
  readonly salesInvoiceNextNumber: number;
  readonly deliveryNoteNextNumber: number;
  readonly companyVersion: number;
}

/**
 * Validates a next number that fits the existing eight-digit sales format.
 * @param value - Proposed positive number, before the next allocation.
 * @returns The validated value.
 * @throws {CompanyFailure} When the value is not allocatable by the legacy counter.
 */
export function documentSeriesNextNumber(value: number): number {
  // PostgreSQL lpad(text, 8, '0') truncates values longer than eight digits.
  if (!Number.isSafeInteger(value) || value < 1 || value > 99_999_999) {
    throw new CompanyFailure("COMPANY_DOCUMENT_NUMBER_INVALID", "The next document number is invalid.");
  }
  return value;
}

export interface CompanyState {
  readonly id: CompanyId;
  readonly organizationId: OrganizationId;
  readonly legacyCompanyId: string | null;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: TaxId | null;
  readonly country: CompanyCountry;
  readonly status: CompanyStatus;
  readonly operatingProfile?: CompanyOperatingProfile;
  /** Null means a historical company awaits verified classification. */
  readonly personNature?: CompanyPersonNature | null;
  /** Public HTTPS logo reference. Legacy rows omit it and rehydrate as null. */
  readonly logoUrl?: string | null;
  /** Persisted optimistic-concurrency revision; omitted legacy snapshots rehydrate as one. */
  readonly version?: number;
}

/** A company legal identity and lifecycle snapshot owned by one organization. */
export class Company {
  readonly id: CompanyId;
  readonly organizationId: OrganizationId;
  readonly legacyCompanyId: string | null;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: TaxId | null;
  readonly country: CompanyCountry;
  readonly status: CompanyStatus;
  readonly operatingProfile: CompanyOperatingProfile;
  readonly personNature: CompanyPersonNature | null;
  readonly logoUrl: string | null;
  readonly version: number;

  /**
   * Rehydrates a validated company snapshot.
   * @param state - Complete authoritative company state.
   * @throws {CompanyFailure} When an identity, name, lifecycle, or version is invalid.
   */
  constructor(state: CompanyState) {
    this.id = state.id;
    this.organizationId = state.organizationId;
    this.legacyCompanyId = state.legacyCompanyId;
    this.legalName = requiredName(state.legalName);
    this.tradeName = optionalName(state.tradeName);
    this.taxId = state.taxId;
    this.country = validateCountry(state.country);
    this.status = validateStatus(state.status);
    this.operatingProfile = validateOperatingProfile(state.operatingProfile ?? "standard");
    this.personNature = state.personNature == null ? null : companyPersonNature(state.personNature);
    this.logoUrl = companyLogoUrl(state.logoUrl ?? null);
    this.version = companyVersion(state.version ?? 1);
    Object.freeze(this);
  }

  /**
   * Ensures this company can receive operational records.
   * @returns Nothing when the company is active.
   * @throws {CompanyFailure} When the lifecycle state is not active.
   */
  assertOperational(): void {
    if (this.status !== CompanyStatus.Active) {
      throw new CompanyFailure("COMPANY_NOT_OPERATIONAL", "The company is not operational.");
    }
  }

  /**
   * Ensures this snapshot belongs to the requested organization.
   * @param organizationId - Organization expected to own the company.
   * @returns Nothing when the organization matches.
   * @throws {CompanyFailure} When the company belongs to another organization.
   */
  assertBelongsTo(organizationId: OrganizationId): void {
    if (this.organizationId !== organizationId) {
      throw new CompanyFailure("COMPANY_OUTSIDE_ORGANIZATION", "The company belongs to another organization.");
    }
  }

  /**
   * Produces the requested suspended state without changing its persisted revision.
   * @returns A suspension candidate that persistence must save with an expected version.
   * @throws {CompanyFailure} When the current state cannot transition to suspended.
   */
  suspend(): Company {
    if (this.status !== CompanyStatus.Active) {
      throw new CompanyFailure("COMPANY_TRANSITION_INVALID", "Only an active company can be suspended.");
    }
    return new Company({ ...this, status: CompanyStatus.Suspended });
  }

  /**
   * Produces the requested active state without changing its persisted revision.
   * @returns An activation candidate that persistence must save with an expected version.
   * @throws {CompanyFailure} When the current state cannot transition to active.
   */
  activate(): Company {
    if (this.status !== CompanyStatus.Suspended) {
      throw new CompanyFailure("COMPANY_TRANSITION_INVALID", "Only a suspended company can be activated.");
    }
    return new Company({ ...this, status: CompanyStatus.Active });
  }
}

export type CompanyFailureCode =
  | "COMPANY_INVALID"
  | "COMPANY_NOT_FOUND"
  | "COMPANY_NOT_OPERATIONAL"
  | "COMPANY_OUTSIDE_ORGANIZATION"
  | "COMPANY_TRANSITION_INVALID"
  | "COMPANY_VERSION_CONFLICT"
  | "COMPANY_ALREADY_EXISTS"
  | "COMPANY_IDEMPOTENCY_CONFLICT"
  | "COMPANY_ORGANIZATION_NOT_READY"
  | "COMPANY_ACCESS_DENIED"
  | "COMPANY_DOCUMENT_NUMBER_INVALID"
  | "COMPANY_DOCUMENT_NUMBER_REWIND"
  | "COMPANY_DOCUMENT_NUMBER_IN_USE"
  | "COMPANY_DOCUMENT_SERIES_INVALID"
  | "COMPANY_DOCUMENT_SERIES_NOT_FOUND"
  | "COMPANY_DOCUMENT_SERIES_VERSION_CONFLICT"
  | "COMPANY_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT"
  | "COMPANY_DOCUMENT_SERIES_SELECTION_INVALID"
  | "COMPANY_DOCUMENT_NUMBER_EXHAUSTED"
  | "COMPANY_MONETARY_POLICY_INVALID"
  | "COMPANY_MONETARY_POLICY_NOT_CONFIGURED"
  | "COMPANY_MONETARY_POLICY_REVISION_NOT_FOUND"
  | "COMPANY_MONETARY_POLICY_VERSION_CONFLICT"
  | "COMPANY_MONETARY_POLICY_IDEMPOTENCY_CONFLICT"
  | "COMPANY_DATE_FORMAT_INVALID"
  | "COMPANY_DATE_FORMAT_REVISION_NOT_FOUND"
  | "COMPANY_DATE_FORMAT_VERSION_CONFLICT"
  | "COMPANY_DATE_FORMAT_IDEMPOTENCY_CONFLICT"
  | "COMPANY_FISCAL_PROFILE_INVALID"
  | "COMPANY_FISCAL_PROFILE_IDEMPOTENCY_CONFLICT"
  | "COMPANY_FISCAL_PROFILE_UNCHANGED"
  | "COMPANY_LOGO_INVALID"
  | "COMPANY_LOGO_EVENT_IMMUTABLE"
  | "COMPANY_LOGO_STORAGE_UNAVAILABLE"
  | "COMPANY_LOGO_COMPENSATION_FAILED"
  | "COMPANY_BRANCH_INVALID"
  | "COMPANY_BRANCH_ALREADY_EXISTS"
  | "COMPANY_BRANCH_IDEMPOTENCY_CONFLICT"
  | "COMPANY_BRANCH_COMPANY_NOT_FOUND"
  | "COMPANY_BRANCH_NOT_FOUND"
  | "COMPANY_BRANCH_SELECTION_INVALID"
  | "COMPANY_BRANCH_SELECTION_VERSION_CONFLICT"
  | "COMPANY_BRANCH_SELECTION_ACCESS_DENIED"
  | "COMPANY_BRANCH_COMPANY_NOT_OPERATIONAL"
  | "COMPANY_BRANCH_MEMBERSHIP_INVALID"
  | "COMPANY_BRANCH_MEMBER_NOT_FOUND"
  | "COMPANY_BRANCH_MEMBERSHIP_NOT_FOUND"
  | "COMPANY_BRANCH_MEMBERSHIP_VERSION_CONFLICT"
  | "COMPANY_BRANCH_ASSIGNMENT_REQUIRED"
  | "COMPANY_BRANCH_CONNECTIVITY_INVALID"
  | "COMPANY_BRANCH_CONNECTIVITY_ACCESS_DENIED"
  | "COMPANY_SECONDARY_TAX_IDENTIFIER_INVALID"
  | "COMPANY_SECONDARY_TAX_IDENTIFIER_VERSION_CONFLICT"
  | "COMPANY_SECONDARY_TAX_IDENTIFIER_NOT_FOUND"
  | "COMPANY_CONFIGURATION_COPY_INVALID"
  | "COMPANY_CONFIGURATION_SOURCE_SETTINGS_ABSENT"
  | "COMPANY_CONFIGURATION_COPY_VERSION_CONFLICT"
  | "COMPANY_CONFIGURATION_COPY_IDEMPOTENCY_CONFLICT"
  | "COMPANY_REPOSITORY_UNAVAILABLE";

/**
 * Normalizes a portable company identifier.
 * @param value - Identifier supplied by an adapter or caller.
 * @returns The normalized branded identifier.
 * @throws {CompanyFailure} When the identifier is empty or too long.
 */
export function companyId(value: string): CompanyId {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) throw new CompanyFailure("COMPANY_INVALID", "Company identifiers are invalid.");
  return normalized as CompanyId;
}

/**
 * Canonicalizes a Venezuelan RIF while preserving its semantic components.
 * @param value - RIF in a supported display form.
 * @returns The canonical RIF.
 * @throws {CompanyFailure} When the RIF is not valid.
 */
export function taxId(value: string): TaxId {
  const compact = value.trim().toUpperCase().replace(/[.\-\s]/g, "");
  // Historical records may omit the leading zero from the eight-digit RIF
  // body or use dots/no separators. Only those presentation variants are
  // canonicalized; every semantic component remains mandatory.
  const parts = /^([VEJPGC])(\d{7,8})(\d)$/.exec(compact);
  if (!parts) throw new CompanyFailure("COMPANY_INVALID", "The Venezuelan tax identifier is invalid.");
  return `${parts[1]}-${parts[2]!.padStart(8, "0")}-${parts[3]}` as TaxId;
}

/**
 * Validates a persisted optimistic-concurrency revision.
 * @param value - Revision supplied by persistence.
 * @returns The validated revision.
 * @throws {CompanyFailure} When the revision is not a positive integer.
 */
export function companyVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new CompanyFailure("COMPANY_INVALID", "Company versions must be positive integers.");
  return value;
}

function requiredName(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) throw new CompanyFailure("COMPANY_INVALID", "The legal name is invalid.");
  return normalized;
}

function optionalName(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized ? requiredName(normalized) : null;
}

function validateCountry(value: CompanyCountry): CompanyCountry {
  if (value !== CompanyCountry.Venezuela) {
    throw new CompanyFailure("COMPANY_INVALID", "The company country is invalid.");
  }
  return value;
}

function validateStatus(value: CompanyStatus): CompanyStatus {
  if (!Object.values(CompanyStatus).includes(value)) {
    throw new CompanyFailure("COMPANY_INVALID", "The company status is invalid.");
  }
  return value;
}

function validateOperatingProfile(value: CompanyOperatingProfile): CompanyOperatingProfile {
  if (value !== "standard" && value !== "kiosk") {
    throw new CompanyFailure("COMPANY_INVALID", "The company operating profile is invalid.");
  }
  return value;
}
