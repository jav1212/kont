import {
  DelegatedAccessAssignmentStatus,
  DelegatedAccessFailure,
  DelegatedAccessStatus,
  assertDelegatedAccessCanAssignMembers,
  assertDelegatedAccessCanBeAccepted,
  assertDelegatedAccessTransition,
  assertValidDelegatedAccess,
  type DelegatedAccessScope,
  type DelegatedAccessGrant,
  type DelegatedAccessGrantId,
} from "../domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";

export interface AssignedDelegatedAccess {
  readonly grant: DelegatedAccessGrant;
  readonly clientOrganizationName: string;
  readonly assignmentStatus: DelegatedAccessAssignmentStatus;
}

export interface DelegatedAccessRepository {
  listAssignedToUser(userId: UserId): Promise<readonly AssignedDelegatedAccess[]>;
  findById(id: DelegatedAccessGrantId): Promise<DelegatedAccessGrant | null>;
  findAssigned(
    userId: UserId,
    providerOrganizationId: OrganizationId,
    clientOrganizationId: OrganizationId,
  ): Promise<AssignedDelegatedAccess | null>;
  create(input: CreateDelegatedAccessRecord): Promise<DelegatedAccessGrant>;
  accept(id: DelegatedAccessGrantId, acceptedBy: UserId, occurredAt: string): Promise<DelegatedAccessGrant>;
  changeStatus(
    id: DelegatedAccessGrantId,
    status: DelegatedAccessStatus,
    changedBy: UserId,
    occurredAt: string,
  ): Promise<DelegatedAccessGrant>;
  assignMember(id: DelegatedAccessGrantId, userId: UserId, assignedBy: UserId, occurredAt: string): Promise<void>;
}

export interface CreateDelegatedAccessRecord {
  readonly providerOrganizationId: OrganizationId;
  readonly clientOrganizationId: OrganizationId;
  readonly scopes: readonly DelegatedAccessScope[];
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly requestedBy: UserId;
}

export enum DelegatedAccessAction {
  Request = "request",
  Accept = "accept",
  AssignMember = "assign_member",
  Suspend = "suspend",
  Revoke = "revoke",
}

export interface DelegatedAccessOperationContext {
  readonly actorUserId: UserId;
  readonly requestId: string;
  readonly occurredAt: string;
}

export interface DelegatedAccessAuthorizer {
  requireManage(userId: UserId, organizationId: OrganizationId, requestId: string, occurredAt: string): Promise<void>;
}

export interface DelegatedAccessAuditLog {
  record(input: {
    readonly delegationId: DelegatedAccessGrantId;
    readonly action: DelegatedAccessAction;
    readonly actorUserId: UserId;
    readonly requestId: string;
    readonly occurredAt: string;
  }): Promise<void>;
}

export class CreateDelegatedAccess {
  constructor(
    private readonly repository: DelegatedAccessRepository,
    private readonly authorizer?: DelegatedAccessAuthorizer,
    private readonly audit?: DelegatedAccessAuditLog,
  ) {}
  async execute(input: CreateDelegatedAccessRecord, context?: DelegatedAccessOperationContext): Promise<DelegatedAccessGrant> {
    assertValidDelegatedAccess(input.providerOrganizationId, input.clientOrganizationId, input.scopes);
    validatePeriod(input.validFrom, input.validUntil);
    if (context && this.authorizer) {
      await this.authorizer.requireManage(context.actorUserId, input.providerOrganizationId, context.requestId, context.occurredAt);
    }
    const created = await this.repository.create(input);
    if (context && this.audit) {
      await this.audit.record({ delegationId: created.id, action: DelegatedAccessAction.Request, ...context });
    }
    return created;
  }
}

export class AcceptDelegatedAccess {
  constructor(private readonly repository: DelegatedAccessRepository) {}
  async execute(id: DelegatedAccessGrantId, acceptedBy: UserId, occurredAt: string) {
    const grant = await requiredDelegation(this.repository, id);
    assertDelegatedAccessCanBeAccepted(grant);
    return this.repository.accept(id, acceptedBy, occurredAt);
  }
}

export class AssignDelegatedAccessMember {
  constructor(private readonly repository: DelegatedAccessRepository) {}
  async execute(id: DelegatedAccessGrantId, userId: UserId, assignedBy: UserId, occurredAt: string): Promise<void> {
    const grant = await requiredDelegation(this.repository, id);
    assertDelegatedAccessCanAssignMembers(grant);
    await this.repository.assignMember(id, userId, assignedBy, occurredAt);
  }
}

export class ChangeDelegatedAccessStatus {
  constructor(private readonly repository: DelegatedAccessRepository) {}
  async execute(
    id: DelegatedAccessGrantId,
    status: DelegatedAccessStatus.Suspended | DelegatedAccessStatus.Revoked,
    changedBy: UserId,
    occurredAt: string,
  ) {
    const current = await requiredDelegation(this.repository, id);
    assertDelegatedAccessTransition(current, status);
    return this.repository.changeStatus(id, status, changedBy, occurredAt);
  }
}

async function requiredDelegation(repository: DelegatedAccessRepository, id: DelegatedAccessGrantId) {
  const grant = await repository.findById(id);
  if (!grant) throw new DelegatedAccessFailure("DELEGATED_ACCESS_NOT_FOUND", "La delegación no existe.");
  return grant;
}

function validatePeriod(validFrom: string, validUntil: string | null): void {
  const start = Date.parse(validFrom);
  const end = validUntil === null ? null : Date.parse(validUntil);
  if (!Number.isFinite(start) || (end !== null && (!Number.isFinite(end) || end <= start))) {
    throw new DelegatedAccessFailure("DELEGATED_ACCESS_INVALID", "El período de delegación no es válido.");
  }
}
