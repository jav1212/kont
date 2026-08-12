import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateDelegationRecord,
  DelegatedOrganizationAccess,
  OrganizationDelegationRepository,
} from "@kontave/organization-delegations-application";
import {
  OrganizationAccessFailure,
  OrganizationDelegationStatus,
  organizationDelegationId,
  type OrganizationDelegationId,
} from "@kontave/organization-delegations-domain";
import { organizationId, type OrganizationId, type UserId } from "@kontave/organizations-domain";
import { delegationRowSchema } from "./persistence-codecs";

export interface OrganizationAccessSupabaseConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

export function createOrganizationAccessInfrastructure(configuration: OrganizationAccessSupabaseConfiguration) {
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { delegations: new SupabaseOrganizationDelegationRepository(client) };
}

class SupabaseOrganizationDelegationRepository implements OrganizationDelegationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listAssignedToUser(userId: UserId): Promise<readonly DelegatedOrganizationAccess[]> {
    const { data, error } = await this.client.rpc("list_user_organization_delegations", { p_user_id: userId });
    if (error) throw repositoryFailure(error);
    return delegationRowSchema.array().parse(data ?? []).map((row) => ({
      delegation: mapDelegation(row),
      clientOrganizationName: row.client_organization_name ?? "Organización",
      assignmentStatus: requiredAssignmentStatus(row.assignment_status),
    }));
  }

  async findById(id: OrganizationDelegationId) {
    const { data, error } = await this.client.rpc("get_organization_delegation", { p_delegation_id: id });
    if (error) throw repositoryFailure(error);
    const row = delegationRowSchema.nullable().parse(data);
    return row ? mapDelegation(row) : null;
  }

  async findAssigned(userId: UserId, provider: OrganizationId, client: OrganizationId) {
    const rows = await this.listAssignedToUser(userId);
    return rows.find((row) =>
      row.delegation.providerOrganizationId === provider && row.delegation.clientOrganizationId === client,
    ) ?? null;
  }

  async create(input: CreateDelegationRecord) {
    const { data, error } = await this.client.rpc("create_organization_delegation", {
      p_provider_organization_id: input.providerOrganizationId,
      p_client_organization_id: input.clientOrganizationId,
      p_scopes: input.scopes,
      p_valid_from: input.validFrom,
      p_valid_until: input.validUntil,
      p_requested_by: input.requestedBy,
    });
    if (error) throw mapRepositoryError(error);
    return mapDelegation(delegationRowSchema.parse(data));
  }

  async accept(id: OrganizationDelegationId, acceptedBy: UserId, occurredAt: string) {
    return this.transition("accept_organization_delegation", id, acceptedBy, occurredAt);
  }

  async changeStatus(id: OrganizationDelegationId, status: OrganizationDelegationStatus, changedBy: UserId, occurredAt: string) {
    const { data, error } = await this.client.rpc("change_organization_delegation_status", {
      p_delegation_id: id,
      p_status: status,
      p_changed_by: changedBy,
      p_occurred_at: occurredAt,
    });
    if (error) throw mapRepositoryError(error);
    return mapDelegation(delegationRowSchema.parse(data));
  }

  async assignMember(id: OrganizationDelegationId, userId: UserId, assignedBy: UserId, occurredAt: string) {
    const { error } = await this.client.rpc("assign_organization_delegation_member", {
      p_delegation_id: id,
      p_user_id: userId,
      p_assigned_by: assignedBy,
      p_occurred_at: occurredAt,
    });
    if (error) throw mapRepositoryError(error);
  }

  private async transition(functionName: string, id: OrganizationDelegationId, actor: UserId, occurredAt: string) {
    const { data, error } = await this.client.rpc(functionName, {
      p_delegation_id: id,
      p_actor_user_id: actor,
      p_occurred_at: occurredAt,
    });
    if (error) throw mapRepositoryError(error);
    return mapDelegation(delegationRowSchema.parse(data));
  }
}

function mapDelegation(row: ReturnType<typeof delegationRowSchema.parse>) {
  return {
    id: organizationDelegationId(row.id),
    providerOrganizationId: organizationId(row.provider_organization_id),
    clientOrganizationId: organizationId(row.client_organization_id),
    status: row.status,
    scopes: row.scopes ?? [],
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    acceptedAt: row.accepted_at,
    suspendedAt: row.suspended_at,
    revokedAt: row.revoked_at,
  };
}

function requiredAssignmentStatus(value: ReturnType<typeof delegationRowSchema.parse>["assignment_status"]) {
  if (value === undefined) throw repositoryFailure(new Error("Missing assignment status."));
  return value;
}

function mapRepositoryError(error: { message?: string }) {
  const message = error.message ?? "";
  if (message.includes("delegation_not_found")) {
    return new OrganizationAccessFailure("DELEGATION_NOT_FOUND", "La delegación no existe.");
  }
  if (message.includes("delegation_transition_invalid")) {
    return new OrganizationAccessFailure("DELEGATION_TRANSITION_INVALID", "Transición de delegación inválida.");
  }
  return repositoryFailure(error);
}

function repositoryFailure(cause: unknown) {
  return new OrganizationAccessFailure(
    "ORGANIZATION_ACCESS_REPOSITORY_UNAVAILABLE",
    "No se pudo acceder al portafolio organizacional.",
    { cause },
  );
}
