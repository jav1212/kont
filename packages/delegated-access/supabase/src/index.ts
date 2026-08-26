import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateDelegatedAccessRecord,
  AssignedDelegatedAccess,
  DelegatedAccessRepository,
} from "@kontave/delegated-access-application";
import {
  DelegatedAccessFailure,
  DelegatedAccessStatus,
  delegatedAccessGrantId,
  type DelegatedAccessGrantId,
} from "@kontave/delegated-access-domain";
import { organizationId, type OrganizationId, type UserId } from "@kontave/organizations-domain";
import { delegationRowSchema } from "./persistence-codecs";

export interface DelegatedAccessSupabaseConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

export function createDelegatedAccessInfrastructure(configuration: DelegatedAccessSupabaseConfiguration) {
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { delegatedAccess: new SupabaseDelegatedAccessRepository(client) };
}

class SupabaseDelegatedAccessRepository implements DelegatedAccessRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listAssignedToUser(userId: UserId): Promise<readonly AssignedDelegatedAccess[]> {
    const { data, error } = await this.client.rpc("list_user_organization_delegations", { p_user_id: userId });
    if (error) throw repositoryFailure(error);
    return delegationRowSchema.array().parse(data ?? []).map((row) => ({
      grant: mapDelegation(row),
      clientOrganizationName: row.client_organization_name ?? "Organización",
      assignmentStatus: requiredAssignmentStatus(row.assignment_status),
    }));
  }

  async findById(id: DelegatedAccessGrantId) {
    const { data, error } = await this.client.rpc("get_organization_delegation", { p_delegation_id: id });
    if (error) throw repositoryFailure(error);
    const row = delegationRowSchema.nullable().parse(data);
    return row ? mapDelegation(row) : null;
  }

  async findAssigned(userId: UserId, provider: OrganizationId, client: OrganizationId) {
    const rows = await this.listAssignedToUser(userId);
    return rows.find((row) =>
      row.grant.providerOrganizationId === provider && row.grant.clientOrganizationId === client,
    ) ?? null;
  }

  async create(input: CreateDelegatedAccessRecord) {
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

  async accept(id: DelegatedAccessGrantId, acceptedBy: UserId, occurredAt: string) {
    return this.transition("accept_organization_delegation", id, acceptedBy, occurredAt);
  }

  async changeStatus(id: DelegatedAccessGrantId, status: DelegatedAccessStatus, changedBy: UserId, occurredAt: string) {
    const { data, error } = await this.client.rpc("change_organization_delegation_status", {
      p_delegation_id: id,
      p_status: status,
      p_changed_by: changedBy,
      p_occurred_at: occurredAt,
    });
    if (error) throw mapRepositoryError(error);
    return mapDelegation(delegationRowSchema.parse(data));
  }

  async assignMember(id: DelegatedAccessGrantId, userId: UserId, assignedBy: UserId, occurredAt: string) {
    const { error } = await this.client.rpc("assign_organization_delegation_member", {
      p_delegation_id: id,
      p_user_id: userId,
      p_assigned_by: assignedBy,
      p_occurred_at: occurredAt,
    });
    if (error) throw mapRepositoryError(error);
  }

  private async transition(functionName: string, id: DelegatedAccessGrantId, actor: UserId, occurredAt: string) {
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
    id: delegatedAccessGrantId(row.id),
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
    return new DelegatedAccessFailure("DELEGATED_ACCESS_NOT_FOUND", "La delegación no existe.");
  }
  if (message.includes("delegation_transition_invalid")) {
    return new DelegatedAccessFailure("DELEGATED_ACCESS_TRANSITION_INVALID", "Transición de delegación inválida.");
  }
  return repositoryFailure(error);
}

function repositoryFailure(cause: unknown) {
  return new DelegatedAccessFailure(
    "DELEGATED_ACCESS_REPOSITORY_UNAVAILABLE",
    "No se pudo acceder al portafolio organizacional.",
    { cause },
  );
}
