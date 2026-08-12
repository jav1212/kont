import {
  DelegationAssignmentStatus,
  OrganizationAccessFailure,
  OrganizationDelegationStatus,
  assertDelegationCanAssignMembers,
  assertDelegationCanBeAccepted,
  assertDelegationTransition,
  assertValidDelegation,
  type DelegatedScope,
  type OrganizationDelegation,
  type OrganizationDelegationId,
} from "@kontave/organization-delegations-domain";
import type { OrganizationId, UserId } from "@kontave/organizations-domain";

export interface DelegatedOrganizationAccess {
  readonly delegation: OrganizationDelegation;
  readonly clientOrganizationName: string;
  readonly assignmentStatus: DelegationAssignmentStatus;
}

export interface OrganizationDelegationRepository {
  listAssignedToUser(userId: UserId): Promise<readonly DelegatedOrganizationAccess[]>;
  findById(id: OrganizationDelegationId): Promise<OrganizationDelegation | null>;
  findAssigned(
    userId: UserId,
    providerOrganizationId: OrganizationId,
    clientOrganizationId: OrganizationId,
  ): Promise<DelegatedOrganizationAccess | null>;
  create(input: CreateDelegationRecord): Promise<OrganizationDelegation>;
  accept(id: OrganizationDelegationId, acceptedBy: UserId, occurredAt: string): Promise<OrganizationDelegation>;
  changeStatus(
    id: OrganizationDelegationId,
    status: OrganizationDelegationStatus,
    changedBy: UserId,
    occurredAt: string,
  ): Promise<OrganizationDelegation>;
  assignMember(id: OrganizationDelegationId, userId: UserId, assignedBy: UserId, occurredAt: string): Promise<void>;
}

export interface CreateDelegationRecord {
  readonly providerOrganizationId: OrganizationId;
  readonly clientOrganizationId: OrganizationId;
  readonly scopes: readonly DelegatedScope[];
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly requestedBy: UserId;
}

export enum DelegationAction {
  Request = "request",
  Accept = "accept",
  AssignMember = "assign_member",
  Suspend = "suspend",
  Revoke = "revoke",
}

export interface DelegationOperationContext {
  readonly actorUserId: UserId;
  readonly requestId: string;
  readonly occurredAt: string;
}

export interface DelegationAuthorizer {
  requireManage(userId: UserId, organizationId: OrganizationId, requestId: string, occurredAt: string): Promise<void>;
}

export interface DelegationAuditLog {
  record(input: {
    readonly delegationId: OrganizationDelegationId;
    readonly action: DelegationAction;
    readonly actorUserId: UserId;
    readonly requestId: string;
    readonly occurredAt: string;
  }): Promise<void>;
}

export class CreateOrganizationDelegation {
  constructor(
    private readonly repository: OrganizationDelegationRepository,
    private readonly authorizer?: DelegationAuthorizer,
    private readonly audit?: DelegationAuditLog,
  ) {}
  async execute(input: CreateDelegationRecord, context?: DelegationOperationContext): Promise<OrganizationDelegation> {
    assertValidDelegation(input.providerOrganizationId, input.clientOrganizationId, input.scopes);
    validatePeriod(input.validFrom, input.validUntil);
    if (context && this.authorizer) {
      await this.authorizer.requireManage(context.actorUserId, input.providerOrganizationId, context.requestId, context.occurredAt);
    }
    const created = await this.repository.create(input);
    if (context && this.audit) {
      await this.audit.record({ delegationId: created.id, action: DelegationAction.Request, ...context });
    }
    return created;
  }
}

export class AcceptOrganizationDelegation {
  constructor(private readonly repository: OrganizationDelegationRepository) {}
  async execute(id: OrganizationDelegationId, acceptedBy: UserId, occurredAt: string) {
    const delegation = await requiredDelegation(this.repository, id);
    assertDelegationCanBeAccepted(delegation);
    return this.repository.accept(id, acceptedBy, occurredAt);
  }
}

export class AssignDelegationMember {
  constructor(private readonly repository: OrganizationDelegationRepository) {}
  async execute(id: OrganizationDelegationId, userId: UserId, assignedBy: UserId, occurredAt: string): Promise<void> {
    const delegation = await requiredDelegation(this.repository, id);
    assertDelegationCanAssignMembers(delegation);
    await this.repository.assignMember(id, userId, assignedBy, occurredAt);
  }
}

export class ChangeOrganizationDelegationStatus {
  constructor(private readonly repository: OrganizationDelegationRepository) {}
  async execute(
    id: OrganizationDelegationId,
    status: OrganizationDelegationStatus.Suspended | OrganizationDelegationStatus.Revoked,
    changedBy: UserId,
    occurredAt: string,
  ) {
    const current = await requiredDelegation(this.repository, id);
    assertDelegationTransition(current, status);
    return this.repository.changeStatus(id, status, changedBy, occurredAt);
  }
}

async function requiredDelegation(repository: OrganizationDelegationRepository, id: OrganizationDelegationId) {
  const delegation = await repository.findById(id);
  if (!delegation) throw new OrganizationAccessFailure("DELEGATION_NOT_FOUND", "La delegación no existe.");
  return delegation;
}

function validatePeriod(validFrom: string, validUntil: string | null): void {
  const start = Date.parse(validFrom);
  const end = validUntil === null ? null : Date.parse(validUntil);
  if (!Number.isFinite(start) || (end !== null && (!Number.isFinite(end) || end <= start))) {
    throw new OrganizationAccessFailure("DELEGATION_INVALID", "El período de delegación no es válido.");
  }
}
