import type { OrganizationId, UserId } from "@kontave/organizations-domain";

declare const delegationIdBrand: unique symbol;
export type OrganizationDelegationId = string & { readonly [delegationIdBrand]: true };
export function organizationDelegationId(value: string): OrganizationDelegationId {
  const normalized = value.trim();
  if (!normalized) {
    throw new OrganizationAccessFailure("DELEGATION_INVALID", "Delegation identifiers cannot be empty.");
  }
  return normalized as OrganizationDelegationId;
}

export enum OrganizationDelegationStatus {
  Pending = "pending",
  Active = "active",
  Suspended = "suspended",
  Revoked = "revoked",
  Expired = "expired",
}
export enum DelegatedScope {
  Accounting = "accounting",
  Payroll = "payroll",
  Inventory = "inventory",
  Tax = "tax",
  Documents = "documents",
  Administration = "administration",
}
export enum OrganizationAccessPathKind {
  DirectMembership = "direct_membership",
  DelegatedOrganization = "delegated_organization",
}
export enum DelegationAssignmentStatus {
  Active = "active",
  Revoked = "revoked",
}

export interface OrganizationDelegation {
  readonly id: OrganizationDelegationId;
  readonly providerOrganizationId: OrganizationId;
  readonly clientOrganizationId: OrganizationId;
  readonly status: OrganizationDelegationStatus;
  readonly scopes: readonly DelegatedScope[];
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly acceptedAt: string | null;
  readonly suspendedAt: string | null;
  readonly revokedAt: string | null;
}
export interface DelegationMemberAssignment {
  readonly id: string;
  readonly delegationId: OrganizationDelegationId;
  readonly userId: UserId;
  readonly status: DelegationAssignmentStatus;
  readonly assignedAt: string;
  readonly revokedAt: string | null;
}
export interface OrganizationAccessPath {
  readonly kind: OrganizationAccessPathKind;
  readonly actorUserId: UserId;
  readonly actingOrganizationId: OrganizationId;
  readonly targetOrganizationId: OrganizationId;
  readonly delegationId: OrganizationDelegationId | null;
  readonly scopes: readonly DelegatedScope[];
}
export interface AccessibleOrganization {
  readonly organizationId: OrganizationId;
  readonly name: string;
  readonly accessPath: OrganizationAccessPath;
}

export type OrganizationAccessFailureCode =
  | "DELEGATION_INVALID"
  | "DELEGATION_SELF_REFERENCE"
  | "DELEGATION_SCOPES_EMPTY"
  | "DELEGATION_NOT_FOUND"
  | "DELEGATION_NOT_ACTIVE"
  | "DELEGATION_TRANSITION_INVALID"
  | "DELEGATION_ASSIGNMENT_REQUIRED"
  | "ACCESS_PATH_NOT_FOUND"
  | "ORGANIZATION_ACCESS_REPOSITORY_UNAVAILABLE";

export class OrganizationAccessFailure extends Error {
  constructor(readonly code: OrganizationAccessFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OrganizationAccessFailure";
  }
}

export function assertValidDelegation(
  provider: OrganizationId,
  client: OrganizationId,
  scopes: readonly DelegatedScope[],
): void {
  if (provider === client) {
    throw new OrganizationAccessFailure("DELEGATION_SELF_REFERENCE", "An organization cannot delegate access to itself.");
  }
  if (scopes.length === 0) {
    throw new OrganizationAccessFailure("DELEGATION_SCOPES_EMPTY", "A delegation requires at least one scope.");
  }
}

export function canAcceptDelegation(status: OrganizationDelegationStatus): boolean {
  return status === OrganizationDelegationStatus.Pending;
}

export function assertDelegationCanBeAccepted(delegation: OrganizationDelegation): void {
  if (!canAcceptDelegation(delegation.status)) {
    throw new OrganizationAccessFailure("DELEGATION_TRANSITION_INVALID", "The delegation is not pending.");
  }
}

export function assertDelegationCanAssignMembers(delegation: OrganizationDelegation): void {
  if (delegation.status !== OrganizationDelegationStatus.Active) {
    throw new OrganizationAccessFailure("DELEGATION_NOT_ACTIVE", "The delegation is not active.");
  }
}

export function assertDelegationTransition(
  delegation: OrganizationDelegation,
  target: OrganizationDelegationStatus.Suspended | OrganizationDelegationStatus.Revoked,
): void {
  const canSuspend = target === OrganizationDelegationStatus.Suspended
    && delegation.status === OrganizationDelegationStatus.Active;
  const canRevoke = target === OrganizationDelegationStatus.Revoked
    && delegation.status !== OrganizationDelegationStatus.Revoked
    && delegation.status !== OrganizationDelegationStatus.Expired;
  if (!canSuspend && !canRevoke) {
    throw new OrganizationAccessFailure("DELEGATION_TRANSITION_INVALID", "The delegation transition is invalid.");
  }
}

export function isDelegationEffective(delegation: OrganizationDelegation, occurredAt: string): boolean {
  if (delegation.status !== OrganizationDelegationStatus.Active) return false;
  const at = Date.parse(occurredAt);
  return at >= Date.parse(delegation.validFrom)
    && (delegation.validUntil === null || at <= Date.parse(delegation.validUntil));
}
