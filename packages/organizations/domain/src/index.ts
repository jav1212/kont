declare const organizationIdBrand: unique symbol;
declare const companyIdBrand: unique symbol;
declare const userIdBrand: unique symbol;

export type OrganizationId = string & { readonly [organizationIdBrand]: true };
export type CompanyId = string & { readonly [companyIdBrand]: true };
export type UserId = string & { readonly [userIdBrand]: true };

export type OrganizationStatus = "active" | "suspended";
export type OrganizationRole = "owner" | "admin" | "accountant" | "seller" | "cashier";
export type MembershipStatus = "active" | "suspended";
export type Permission = `${string}.${string}` | "*";

export interface Organization {
  readonly id: OrganizationId;
  readonly name: string;
  readonly slug: string;
  readonly status: OrganizationStatus;
}

export interface OrganizationMembership {
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly role: OrganizationRole;
  readonly status: MembershipStatus;
  readonly permissions: readonly Permission[];
}

export interface OrganizationCompany {
  readonly id: CompanyId;
  readonly organizationId: OrganizationId;
  readonly name: string;
  readonly rif: string | null;
}

export interface OrganizationAccess {
  readonly organization: Organization;
  readonly membership: OrganizationMembership;
}

export type OrganizationFailureCode =
  | "ORGANIZATION_NOT_FOUND"
  | "ORGANIZATION_ACCESS_DENIED"
  | "COMPANY_NOT_FOUND"
  | "COMPANY_ACCESS_DENIED"
  | "ORGANIZATION_REPOSITORY_UNAVAILABLE";

export class OrganizationFailure extends Error {
  constructor(readonly code: OrganizationFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OrganizationFailure";
  }
}

export function organizationId(value: string): OrganizationId {
  return requireIdentifier(value, "organizationId") as OrganizationId;
}

export function companyId(value: string): CompanyId {
  return requireIdentifier(value, "companyId") as CompanyId;
}

export function userId(value: string): UserId {
  return requireIdentifier(value, "userId") as UserId;
}

function requireIdentifier(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) throw new TypeError(`${field} is invalid.`);
  return normalized;
}
