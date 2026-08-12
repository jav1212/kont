import type {
  CreateDelegationRecord,
  DelegatedOrganizationAccess,
} from "@kontave/organization-delegations-application";
import type { DirectOrganizationAccess } from "@kontave/workspace-context-application";
import {
  DelegationAssignmentStatus,
  OrganizationDelegationStatus,
  organizationDelegationId,
  type OrganizationDelegation,
  type OrganizationDelegationId,
} from "@kontave/organization-delegations-domain";
import type { OrganizationId, UserId } from "@kontave/organizations-domain";

export class InMemoryDirectOrganizationAccessDirectory {
  constructor(private readonly access = new Map<UserId, readonly DirectOrganizationAccess[]>()) {}
  async listForUser(userId: UserId) { return this.access.get(userId) ?? []; }
  async findForUser(userId: UserId, organizationId: OrganizationId) {
    return (await this.listForUser(userId)).find((item) => item.organizationId === organizationId) ?? null;
  }
}

export class InMemoryOrganizationDelegationRepository {
  readonly delegations: OrganizationDelegation[] = [];
  readonly assignments = new Map<OrganizationDelegationId, Map<UserId, DelegationAssignmentStatus>>();
  readonly names = new Map<OrganizationId, string>();

  async listAssignedToUser(userId: UserId): Promise<readonly DelegatedOrganizationAccess[]> {
    return this.delegations.flatMap((delegation) => {
      const assignmentStatus = this.assignments.get(delegation.id)?.get(userId);
      return assignmentStatus === undefined ? [] : [{
        delegation,
        assignmentStatus,
        clientOrganizationName: this.names.get(delegation.clientOrganizationId) ?? "Organization",
      }];
    });
  }

  async findById(id: OrganizationDelegationId) {
    return this.delegations.find((delegation) => delegation.id === id) ?? null;
  }

  async findAssigned(userId: UserId, provider: OrganizationId, client: OrganizationId) {
    return (await this.listAssignedToUser(userId)).find((item) =>
      item.delegation.providerOrganizationId === provider && item.delegation.clientOrganizationId === client,
    ) ?? null;
  }

  async create(input: CreateDelegationRecord) {
    const delegation: OrganizationDelegation = {
      id: organizationDelegationId(crypto.randomUUID()),
      providerOrganizationId: input.providerOrganizationId,
      clientOrganizationId: input.clientOrganizationId,
      status: OrganizationDelegationStatus.Pending,
      scopes: [...new Set(input.scopes)],
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      acceptedAt: null,
      suspendedAt: null,
      revokedAt: null,
    };
    this.delegations.push(delegation);
    return delegation;
  }

  async accept(id: OrganizationDelegationId, _acceptedBy: UserId, occurredAt: string) {
    return this.replace(id, { status: OrganizationDelegationStatus.Active, acceptedAt: occurredAt });
  }

  async changeStatus(id: OrganizationDelegationId, status: OrganizationDelegationStatus, _changedBy: UserId, occurredAt: string) {
    return this.replace(id, {
      status,
      suspendedAt: status === OrganizationDelegationStatus.Suspended ? occurredAt : null,
      revokedAt: status === OrganizationDelegationStatus.Revoked ? occurredAt : null,
    });
  }

  async assignMember(id: OrganizationDelegationId, userId: UserId) {
    const assignments = this.assignments.get(id) ?? new Map<UserId, DelegationAssignmentStatus>();
    assignments.set(userId, DelegationAssignmentStatus.Active);
    this.assignments.set(id, assignments);
  }

  private replace(id: OrganizationDelegationId, changes: Partial<OrganizationDelegation>) {
    const index = this.delegations.findIndex((delegation) => delegation.id === id);
    if (index < 0) throw new Error("Missing delegation fixture.");
    const updated = { ...this.delegations[index], ...changes };
    this.delegations.splice(index, 1, updated);
    return updated;
  }
}
