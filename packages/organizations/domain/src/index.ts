declare const organizationIdBrand: unique symbol;
declare const companyIdBrand: unique symbol;
declare const userIdBrand: unique symbol;

export type OrganizationId = string & { readonly [organizationIdBrand]: true };
export type CompanyId = string & { readonly [companyIdBrand]: true };
export type UserId = string & { readonly [userIdBrand]: true };

export enum OrganizationStatus { Active = "active", Suspended = "suspended" }
export enum OrganizationRole { Owner = "owner", Admin = "admin", Accountant = "accountant", Seller = "seller", Cashier = "cashier" }
export enum MembershipStatus { Active = "active", Suspended = "suspended" }
export type OrganizationMemberStatus = "active" | "invited" | "suspended";
export interface OrganizationMemberProjection { readonly id:string;readonly kind:"membership"|"invitation";readonly organizationId:OrganizationId;readonly userId:UserId|null;readonly email:string;readonly displayName:string|null;readonly avatarUrl:string|null;readonly roleId:string;readonly roleName:string;readonly status:OrganizationMemberStatus;readonly version:number;readonly joinedAt:string|null;readonly invitedAt:string|null;readonly expiresAt:string|null }
export const OrganizationRelationship = { Personal: "personal", Member: "member", Delegated: "delegated" } as const;
export type OrganizationRelationship = typeof OrganizationRelationship[keyof typeof OrganizationRelationship];
export type Permission = `${string}.${string}` | "*";

export interface Organization {
  readonly id: OrganizationId;
  readonly name: string;
  readonly slug: string;
  readonly status: OrganizationStatus;
  readonly logoUrl: string | null;
  readonly version: number;
}

export interface OrganizationMembership {
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly role: OrganizationRole;
  readonly status: MembershipStatus;
  readonly permissions: readonly Permission[];
}
export function isOrganizationOwner(membership: OrganizationMembership): boolean { return membership.role === OrganizationRole.Owner; }
export function hasActiveOrganizationAccess(access: OrganizationAccess): boolean { return access.membership.status === MembershipStatus.Active && access.organization.status === OrganizationStatus.Active; }

export interface OrganizationCompany {
  readonly id: CompanyId;
  readonly organizationId: OrganizationId;
  readonly name: string;
  readonly rif: string | null;
  readonly logoUrl: string | null;
}

export interface OrganizationAccess {
  readonly organization: Organization;
  readonly membership: OrganizationMembership;
  readonly relationship: Exclude<OrganizationRelationship, "delegated">;
}

export type OrganizationFailureCode =
  | "ORGANIZATION_NOT_FOUND"
  | "ORGANIZATION_ACCESS_DENIED"
  | "ORGANIZATION_VERSION_CONFLICT"
  | "ORGANIZATION_DATA_INVALID"
  | "ORGANIZATION_LOGO_INVALID"
  | "MEMBERSHIP_NOT_FOUND"
  | "MEMBERSHIP_VERSION_CONFLICT"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_INVALID"
  | "INVITATION_ALREADY_PENDING"
  | "INVITATION_VERSION_CONFLICT"
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
