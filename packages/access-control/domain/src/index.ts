declare const roleIdBrand: unique symbol;
import { MembershipStatus, OrganizationStatus } from "@kontave/organizations-domain";
declare const membershipIdBrand: unique symbol;
declare const permissionBrand: unique symbol;

export type RoleId = string & { readonly [roleIdBrand]: true };
export type MembershipId = string & { readonly [membershipIdBrand]: true };
export type PermissionCode = PermissionValue & { readonly [permissionBrand]: true };

export const PERMISSIONS = {
  BILLING_READ: "billing.read",
  BILLING_INVOICES_READ: "billing.invoices.read",
  BILLING_PAYMENT_METHODS_READ: "billing.payment_methods.read",
  BILLING_MANAGE: "billing.manage",
  COMPANIES_READ: "companies.read",
  COMPANIES_CREATE: "companies.create",
  COMPANIES_UPDATE: "companies.update",
  COMPANIES_DELETE: "companies.delete",
  MEMBERS_READ: "members.read",
  MEMBERS_INVITE: "members.invite",
  MEMBERS_UPDATE: "members.update",
  MEMBERS_REVOKE: "members.revoke",
  ROLES_READ: "roles.read",
  ROLES_MANAGE: "roles.manage",
  EMPLOYEES_READ: "employees.read",
  EMPLOYEES_CREATE: "employees.create",
  EMPLOYEES_UPDATE: "employees.update",
  EMPLOYEES_DELETE: "employees.delete",
  DOCUMENTS_READ: "documents.read",
  DOCUMENTS_CREATE: "documents.create",
  DOCUMENTS_UPDATE: "documents.update",
  DOCUMENTS_DELETE: "documents.delete",
  PAYROLL_READ: "payroll.read",
  PAYROLL_CREATE: "payroll.create",
  PAYROLL_CONFIRM: "payroll.confirm",
  PAYROLL_DELETE: "payroll.delete",
  INVENTORY_READ: "inventory.read",
  INVENTORY_CREATE: "inventory.create",
  INVENTORY_UPDATE: "inventory.update",
  INVENTORY_DELETE: "inventory.delete",
  PURCHASES_READ: "purchases.read",
  PURCHASES_CREATE: "purchases.create",
  PURCHASES_CONFIRM: "purchases.confirm",
  PURCHASES_CANCEL: "purchases.cancel",
  SALES_READ: "sales.read",
  SALES_CREATE: "sales.create",
  SALES_UPDATE: "sales.update",
  SALES_CONFIRM: "sales.confirm",
  SALES_CANCEL: "sales.cancel",
  ACCOUNTING_READ: "accounting.read",
  ACCOUNTING_CREATE: "accounting.create",
  ACCOUNTING_UPDATE: "accounting.update",
  ACCOUNTING_POST: "accounting.post",
  ACCOUNTING_CLOSE: "accounting.close",
  REPORTS_READ: "reports.read",
} as const;

type PermissionValue = typeof PERMISSIONS[keyof typeof PERMISSIONS];
const permissionValues = new Set<string>(Object.values(PERMISSIONS));
export function permissionCode(value: string): PermissionCode {
  if (!permissionValues.has(value)) throw new TypeError(`Unknown permission: ${value}`);
  return value as PermissionCode;
}
export function roleId(value: string): RoleId { return identifier(value, "roleId") as RoleId; }
export function membershipId(value: string): MembershipId { return identifier(value, "membershipId") as MembershipId; }

export enum RoleKind { System = "system", Custom = "custom" }
export enum RoleCode { Owner = "owner", Admin = "admin", Accountant = "accountant", Seller = "seller", Cashier = "cashier" }
export enum RoleStatus { Active = "active", Archived = "archived" }
export interface RoleProperties { readonly id: RoleId; readonly organizationId: string | null; readonly code: string; readonly name: string; readonly description: string; readonly kind: RoleKind; readonly permissions: readonly PermissionCode[]; readonly status: RoleStatus; readonly version: number }
/** Role owns its invariants; application code must not interpret kind or role codes. */
export class Role {
  readonly id: RoleId; readonly organizationId: string | null; readonly code: string; readonly name: string; readonly description: string; readonly kind: RoleKind; readonly permissions: readonly PermissionCode[]; readonly status: RoleStatus; readonly version: number;
  constructor(properties: RoleProperties) { Object.assign(this, properties); this.id = properties.id; this.organizationId = properties.organizationId; this.code = properties.code; this.name = properties.name; this.description = properties.description; this.kind = properties.kind; this.permissions = Object.freeze([...properties.permissions]); this.status = properties.status; this.version = properties.version; }
  isActive(): boolean { return this.status === RoleStatus.Active; }
  hasPermission(permission: PermissionCode): boolean { return this.permissions.includes(permission); }
  assertMutable(): void { if (this.kind === RoleKind.System) throw new AccessControlFailure("SYSTEM_ROLE_IMMUTABLE", "System roles cannot be modified."); }
  assertAssignableBy(actorRole: Role): void { if (this.code === RoleCode.Owner && actorRole.code !== RoleCode.Owner) throw new AccessControlFailure("CANNOT_ASSIGN_OWNER", "Only an owner can assign the owner role."); }
  assertBelongsTo(organizationId: string): void { if (this.organizationId !== organizationId) throw new AccessControlFailure("ROLE_OUTSIDE_ORGANIZATION", "The role belongs to another organization."); }
}
export enum AuthorizationSource { Web = "web", Desktop = "desktop", Mobile = "mobile", System = "system" }
export interface AuthorizationActor { readonly userId: string; readonly organizationId: string; readonly membershipId?: MembershipId }
export interface AuthorizationResource { readonly type: string; readonly id?: string; readonly organizationId: string; readonly companyId?: string }
export interface AuthorizationRequest {
  readonly actor: AuthorizationActor;
  readonly permission: PermissionCode;
  readonly resource?: AuthorizationResource;
  readonly context: { readonly requestId: string; readonly source: AuthorizationSource; readonly occurredAt: string };
}
export enum AuthorizationReason { PermissionGranted="permission_granted", PermissionMissing="permission_missing", MembershipInactive="membership_inactive", OrganizationSuspended="organization_suspended", ResourceOutsideOrganization="resource_outside_organization", PolicyDenied="policy_denied" }
export interface AuthorizationDecision { readonly allowed: boolean; readonly reason: AuthorizationReason; readonly matchedPolicy?: string; readonly policyVersion?: string }
export interface AuthorizationSnapshot {
  readonly membershipId: MembershipId;
  readonly membershipStatus: MembershipStatus;
  readonly authorizationVersion: number;
  readonly organizationStatus: OrganizationStatus;
  readonly role: Role;
}
export interface Policy { readonly name: string; readonly version: string; evaluate(request: AuthorizationRequest, snapshot: AuthorizationSnapshot): AuthorizationDecision | null }

export class SameOrganizationPolicy implements Policy {
  readonly name = "same-organization";
  readonly version = "1";
  evaluate(request: AuthorizationRequest): AuthorizationDecision | null {
    if (request.resource && request.actor.organizationId !== request.resource.organizationId) return deny(AuthorizationReason.ResourceOutsideOrganization, this);
    return null;
  }
}
export class ActiveAccessPolicy implements Policy {
  readonly name = "active-access";
  readonly version = "1";
  evaluate(_request: AuthorizationRequest, snapshot: AuthorizationSnapshot): AuthorizationDecision | null {
    if (!snapshotIsActive(snapshot)) return deny(snapshot.organizationStatus === OrganizationStatus.Suspended ? AuthorizationReason.OrganizationSuspended : AuthorizationReason.MembershipInactive, this);
    return null;
  }
}
function snapshotIsActive(snapshot: AuthorizationSnapshot): boolean { return snapshot.organizationStatus === OrganizationStatus.Active && snapshot.membershipStatus === MembershipStatus.Active && snapshot.role.isActive(); }
export class RequiredPermissionPolicy implements Policy {
  readonly name = "required-permission";
  readonly version = "1";
  evaluate(request: AuthorizationRequest, snapshot: AuthorizationSnapshot): AuthorizationDecision {
    return snapshot.role.hasPermission(request.permission)
      ? { allowed: true, reason: AuthorizationReason.PermissionGranted, matchedPolicy: this.name, policyVersion: this.version }
      : deny(AuthorizationReason.PermissionMissing, this);
  }
}
export class AuthorizationDenied extends Error {
  constructor(readonly decision: AuthorizationDecision) { super("Access denied."); this.name = "AuthorizationDenied"; }
}
export type AccessControlFailureCode = "CANNOT_GRANT_UNOWNED_PERMISSION" | "CANNOT_ASSIGN_OWNER" | "SYSTEM_ROLE_IMMUTABLE" | "ROLE_IN_USE" | "ROLE_OUTSIDE_ORGANIZATION";
export class AccessControlFailure extends Error { constructor(readonly code: AccessControlFailureCode, message: string) { super(message); this.name = "AccessControlFailure"; } }
function deny(reason: AuthorizationReason, policy: Policy): AuthorizationDecision { return { allowed: false, reason, matchedPolicy: policy.name, policyVersion: policy.version }; }
function identifier(value: string, field: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 128) throw new TypeError(`${field} is invalid.`); return normalized; }
