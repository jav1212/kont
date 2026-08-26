import type {
  CreateDelegatedAccessRecord,
  AssignedDelegatedAccess,
} from "@kontave/delegated-access-application";
import type { DirectOrganizationAccess } from "@kontave/workspace-context-application";
import {
  DelegatedAccessAssignmentStatus,
  DelegatedAccessStatus,
  delegatedAccessGrantId,
  type DelegatedAccessGrant,
  type DelegatedAccessGrantId,
} from "@kontave/delegated-access-domain";
import type { OrganizationId, UserId } from "@kontave/organizations-domain";

export class InMemoryDirectOrganizationAccessDirectory {
  constructor(private readonly access = new Map<UserId, readonly DirectOrganizationAccess[]>()) {}
  async listForUser(userId: UserId) { return this.access.get(userId) ?? []; }
  async findForUser(userId: UserId, organizationId: OrganizationId) {
    return (await this.listForUser(userId)).find((item) => item.organizationId === organizationId) ?? null;
  }
}

export class InMemoryDelegatedAccessRepository {
  readonly delegatedAccess: DelegatedAccessGrant[] = [];
  readonly assignments = new Map<DelegatedAccessGrantId, Map<UserId, DelegatedAccessAssignmentStatus>>();
  readonly names = new Map<OrganizationId, string>();

  async listAssignedToUser(userId: UserId): Promise<readonly AssignedDelegatedAccess[]> {
    return this.delegatedAccess.flatMap((grant) => {
      const assignmentStatus = this.assignments.get(grant.id)?.get(userId);
      return assignmentStatus === undefined ? [] : [{
        grant,
        assignmentStatus,
        clientOrganizationName: this.names.get(grant.clientOrganizationId) ?? "Organization",
      }];
    });
  }

  async findById(id: DelegatedAccessGrantId) {
    return this.delegatedAccess.find((grant) => grant.id === id) ?? null;
  }

  async findAssigned(userId: UserId, provider: OrganizationId, client: OrganizationId) {
    return (await this.listAssignedToUser(userId)).find((item) =>
      item.grant.providerOrganizationId === provider && item.grant.clientOrganizationId === client,
    ) ?? null;
  }

  async create(input: CreateDelegatedAccessRecord) {
    const grant: DelegatedAccessGrant = {
      id: delegatedAccessGrantId(crypto.randomUUID()),
      providerOrganizationId: input.providerOrganizationId,
      clientOrganizationId: input.clientOrganizationId,
      status: DelegatedAccessStatus.Pending,
      scopes: [...new Set(input.scopes)],
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      acceptedAt: null,
      suspendedAt: null,
      revokedAt: null,
    };
    this.delegatedAccess.push(grant);
    return grant;
  }

  async accept(id: DelegatedAccessGrantId, _acceptedBy: UserId, occurredAt: string) {
    return this.replace(id, { status: DelegatedAccessStatus.Active, acceptedAt: occurredAt });
  }

  async changeStatus(id: DelegatedAccessGrantId, status: DelegatedAccessStatus, _changedBy: UserId, occurredAt: string) {
    return this.replace(id, {
      status,
      suspendedAt: status === DelegatedAccessStatus.Suspended ? occurredAt : null,
      revokedAt: status === DelegatedAccessStatus.Revoked ? occurredAt : null,
    });
  }

  async assignMember(id: DelegatedAccessGrantId, userId: UserId) {
    const assignments = this.assignments.get(id) ?? new Map<UserId, DelegatedAccessAssignmentStatus>();
    assignments.set(userId, DelegatedAccessAssignmentStatus.Active);
    this.assignments.set(id, assignments);
  }

  private replace(id: DelegatedAccessGrantId, changes: Partial<DelegatedAccessGrant>) {
    const index = this.delegatedAccess.findIndex((grant) => grant.id === id);
    if (index < 0) throw new Error("Missing grant fixture.");
    const updated = { ...this.delegatedAccess[index], ...changes };
    this.delegatedAccess.splice(index, 1, updated);
    return updated;
  }
}
