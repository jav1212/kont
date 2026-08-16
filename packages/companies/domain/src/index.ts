import type { OrganizationId } from "@kontave/organizations-domain";

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

export interface CompanyState {
  readonly id: CompanyId;
  readonly organizationId: OrganizationId;
  readonly legacyCompanyId: string | null;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: TaxId | null;
  readonly country: CompanyCountry;
  readonly status: CompanyStatus;
}

export class Company {
  readonly id: CompanyId;
  readonly organizationId: OrganizationId;
  readonly legacyCompanyId: string | null;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: TaxId | null;
  readonly country: CompanyCountry;
  readonly status: CompanyStatus;

  constructor(state: CompanyState) {
    this.id = state.id;
    this.organizationId = state.organizationId;
    this.legacyCompanyId = state.legacyCompanyId;
    this.legalName = requiredName(state.legalName);
    this.tradeName = optionalName(state.tradeName);
    this.taxId = state.taxId;
    this.country = state.country;
    this.status = state.status;
  }

  assertOperational(): void {
    if (this.status !== CompanyStatus.Active) {
      throw new CompanyFailure("COMPANY_NOT_OPERATIONAL", "The company is not operational.");
    }
  }

  assertBelongsTo(organizationId: OrganizationId): void {
    if (this.organizationId !== organizationId) {
      throw new CompanyFailure("COMPANY_OUTSIDE_ORGANIZATION", "The company belongs to another organization.");
    }
  }

  suspend(): Company {
    if (this.status !== CompanyStatus.Active) {
      throw new CompanyFailure("COMPANY_TRANSITION_INVALID", "Only an active company can be suspended.");
    }
    return new Company({ ...this, status: CompanyStatus.Suspended });
  }

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
  | "COMPANY_REPOSITORY_UNAVAILABLE";

export class CompanyFailure extends Error {
  constructor(readonly code: CompanyFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CompanyFailure";
  }
}

export function companyId(value: string): CompanyId {
  const normalized = value.trim();
  if (!normalized) throw new CompanyFailure("COMPANY_INVALID", "Company identifiers cannot be empty.");
  return normalized as CompanyId;
}

export function taxId(value: string): TaxId {
  const compact = value.trim().toUpperCase().replace(/[.\-\s]/g, "");
  // Historical records may omit the leading zero from the eight-digit RIF
  // body or use dots/no separators. Only those presentation variants are
  // canonicalized; every semantic component remains mandatory.
  const parts = /^([VEJPGC])(\d{7,8})(\d)$/.exec(compact);
  if (!parts) throw new CompanyFailure("COMPANY_INVALID", "The Venezuelan tax identifier is invalid.");
  return `${parts[1]}-${parts[2]!.padStart(8, "0")}-${parts[3]}` as TaxId;
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
