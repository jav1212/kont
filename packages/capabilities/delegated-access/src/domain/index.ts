import type { OrganizationId, UserId } from "@kontave/organizations/domain";

declare const delegationIdBrand: unique symbol;
export type DelegatedAccessGrantId = string & { readonly [delegationIdBrand]: true };
export function delegatedAccessGrantId(value: string): DelegatedAccessGrantId {
  const normalized = value.trim();
  if (!normalized) {
    throw new DelegatedAccessFailure("DELEGATED_ACCESS_INVALID", "Delegation identifiers cannot be empty.");
  }
  return normalized as DelegatedAccessGrantId;
}

export enum DelegatedAccessStatus {
  Pending = "pending",
  Active = "active",
  Suspended = "suspended",
  Revoked = "revoked",
  Expired = "expired",
}
export enum DelegatedAccessScope {
  Accounting = "accounting",
  Payroll = "payroll",
  Inventory = "inventory",
  Purchases = "purchases",
  Tax = "tax",
  Documents = "documents",
  Administration = "administration",
}
export enum OrganizationAccessPathKind {
  DirectMembership = "direct_membership",
  DelegatedOrganization = "delegated_organization",
}
export enum DelegatedAccessAssignmentStatus {
  Active = "active",
  Revoked = "revoked",
}

export interface DelegatedAccessGrant {
  readonly id: DelegatedAccessGrantId;
  readonly providerOrganizationId: OrganizationId;
  readonly clientOrganizationId: OrganizationId;
  readonly status: DelegatedAccessStatus;
  readonly scopes: readonly DelegatedAccessScope[];
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly acceptedAt: string | null;
  readonly suspendedAt: string | null;
  readonly revokedAt: string | null;
}
export interface DelegatedAccessAssignment {
  readonly id: string;
  readonly delegationId: DelegatedAccessGrantId;
  readonly userId: UserId;
  readonly status: DelegatedAccessAssignmentStatus;
  readonly assignedAt: string;
  readonly revokedAt: string | null;
}
export interface OrganizationAccessPath {
  readonly kind: OrganizationAccessPathKind;
  readonly actorUserId: UserId;
  readonly actingOrganizationId: OrganizationId;
  readonly targetOrganizationId: OrganizationId;
  readonly delegationId: DelegatedAccessGrantId | null;
  readonly scopes: readonly DelegatedAccessScope[];
}
export interface AccessibleOrganization {
  readonly organizationId: OrganizationId;
  readonly name: string;
  readonly accessPath: OrganizationAccessPath;
}

export type DelegatedAccessFailureCode =
  | "DELEGATED_ACCESS_INVALID"
  | "DELEGATED_ACCESS_SELF_REFERENCE"
  | "DELEGATED_ACCESS_SCOPES_EMPTY"
  | "DELEGATED_ACCESS_NOT_FOUND"
  | "DELEGATED_ACCESS_NOT_ACTIVE"
  | "DELEGATED_ACCESS_TRANSITION_INVALID"
  | "DELEGATED_ACCESS_ASSIGNMENT_REQUIRED"
  | "ACCESS_PATH_NOT_FOUND"
  | "DELEGATED_ACCESS_REPOSITORY_UNAVAILABLE";

export class DelegatedAccessFailure extends Error {
  constructor(readonly code: DelegatedAccessFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DelegatedAccessFailure";
  }
}

export function assertValidDelegatedAccess(
  provider: OrganizationId,
  client: OrganizationId,
  scopes: readonly DelegatedAccessScope[],
): void {
  if (provider === client) {
    throw new DelegatedAccessFailure("DELEGATED_ACCESS_SELF_REFERENCE", "An organization cannot delegate access to itself.");
  }
  if (scopes.length === 0) {
    throw new DelegatedAccessFailure("DELEGATED_ACCESS_SCOPES_EMPTY", "A grant requires at least one scope.");
  }
}

export function canAcceptDelegatedAccess(status: DelegatedAccessStatus): boolean {
  return status === DelegatedAccessStatus.Pending;
}

export function assertDelegatedAccessCanBeAccepted(grant: DelegatedAccessGrant): void {
  if (!canAcceptDelegatedAccess(grant.status)) {
    throw new DelegatedAccessFailure("DELEGATED_ACCESS_TRANSITION_INVALID", "The grant is not pending.");
  }
}

export function assertDelegatedAccessCanAssignMembers(grant: DelegatedAccessGrant): void {
  if (grant.status !== DelegatedAccessStatus.Active) {
    throw new DelegatedAccessFailure("DELEGATED_ACCESS_NOT_ACTIVE", "The grant is not active.");
  }
}

export function assertDelegatedAccessTransition(
  grant: DelegatedAccessGrant,
  target: DelegatedAccessStatus.Suspended | DelegatedAccessStatus.Revoked,
): void {
  const canSuspend = target === DelegatedAccessStatus.Suspended
    && grant.status === DelegatedAccessStatus.Active;
  const canRevoke = target === DelegatedAccessStatus.Revoked
    && grant.status !== DelegatedAccessStatus.Revoked
    && grant.status !== DelegatedAccessStatus.Expired;
  if (!canSuspend && !canRevoke) {
    throw new DelegatedAccessFailure("DELEGATED_ACCESS_TRANSITION_INVALID", "The grant transition is invalid.");
  }
}

export function isDelegatedAccessEffective(grant: DelegatedAccessGrant, occurredAt: string): boolean {
  if (grant.status !== DelegatedAccessStatus.Active) return false;
  const at = Date.parse(occurredAt);
  return at >= Date.parse(grant.validFrom)
    && (grant.validUntil === null || at <= Date.parse(grant.validUntil));
}
