import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  OrganizationalUserRepository,
  UserAdministrationAuthorizer,
  UserIdentityDirectory,
} from "../../application/user-administration";
import {
  companyId,
  organizationId,
  userId,
  MembershipStatus,
  UserAdministrationFailure,
  type OrganizationalUser,
  type OrganizationId,
  type UserId,
} from "../../domain";
import type { OrganizationsSupabaseConfiguration } from "./index";
import { z } from "zod";

const rowSchema = z.object({
  organization_id: z.string().uuid(),
  user_id: z.string().uuid(),
  email: z.string().email(),
  display_name: z.string().nullable(),
  administrative_priority: z.number().int().min(0).max(1000),
  allowed_company_ids: z.array(z.string().min(1)),
  status: z.enum(["active", "suspended"]),
  version: z.number().int().positive(),
});
const identitySchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  display_name: z.string().nullable(),
});
const authoritySchema = z.object({
  organization_id: z.string().uuid(),
  maximum_assignable_priority: z.number().int().min(0).max(1000),
});

/**
 * Creates service-bound adapters for SEG-001 through SEG-007.
 * @param configuration - Server-only Supabase endpoint and service-role credentials.
 * @param actorUserId - Actor already authenticated by the composition boundary.
 * @returns Repository, identity directory, and authorizer for organizational-user use cases.
 * @throws {UserAdministrationFailure} When a later adapter operation is rejected or unavailable.
 */
export function createSupabaseOrganizationalUserSecurity(
  configuration: OrganizationsSupabaseConfiguration,
  actorUserId: UserId,
): {
  readonly repository: OrganizationalUserRepository;
  readonly identities: UserIdentityDirectory;
  readonly authorizer: UserAdministrationAuthorizer;
} {
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return {
    repository: new SupabaseOrganizationalUserRepository(client, actorUserId),
    identities: new SupabaseUserIdentityDirectory(client),
    authorizer: new SupabaseUserAdministrationAuthorizer(client),
  };
}

/** Persists local administrative settings without creating or deleting global identities. */
export class SupabaseOrganizationalUserRepository implements OrganizationalUserRepository {
  /**
   * Creates a repository for local organizational-user assignments.
   * @param client - Service-role client whose RPC calls enforce the actor supplied by a trusted boundary.
   * @param actorUserId - Authenticated actor carried to administrative RPC calls.
   * @returns A repository that never owns global identity lifecycle.
   */
  constructor(
    private readonly client: SupabaseClient,
    private readonly actorUserId: UserId,
  ) {}
  /** {@inheritDoc OrganizationalUserRepository.list} */
  async list(
    targetOrganizationId: OrganizationId,
  ): Promise<readonly OrganizationalUser[]> {
    return this.readMany("organization_user_security_list", {
      p_organization_id: targetOrganizationId,
      p_actor_user_id: this.actorUserId,
    });
  }
  /** {@inheritDoc OrganizationalUserRepository.find} */
  async find(
    targetOrganizationId: OrganizationId,
    targetUserId: UserId,
  ): Promise<OrganizationalUser | null> {
    const rows = await this.readMany("organization_user_security_get", {
      p_organization_id: targetOrganizationId,
      p_actor_user_id: this.actorUserId,
      p_user_id: targetUserId,
    });
    return rows[0] ?? null;
  }
  /** {@inheritDoc OrganizationalUserRepository.create} */
  async create(user: OrganizationalUser): Promise<OrganizationalUser> {
    return this.mutate("organization_user_security_create", {
      p_organization_id: user.organizationId,
      p_actor_user_id: this.actorUserId,
      p_user_id: user.userId,
      p_display_name: user.displayName,
      p_administrative_priority: user.administrativePriority,
      p_allowed_company_ids: user.allowedCompanyIds,
    });
  }
  /** {@inheritDoc OrganizationalUserRepository.update} */
  async update(
    targetUserId: UserId,
    targetOrganizationId: OrganizationId,
    changes: Parameters<OrganizationalUserRepository["update"]>[2],
    expectedVersion: number,
  ): Promise<OrganizationalUser> {
    return this.mutate("organization_user_security_update", {
      p_organization_id: targetOrganizationId,
      p_actor_user_id: this.actorUserId,
      p_user_id: targetUserId,
      p_expected_version: expectedVersion,
      p_changes: changes,
    });
  }
  /** {@inheritDoc OrganizationalUserRepository.revoke} */
  async revoke(
    targetUserId: UserId,
    targetOrganizationId: OrganizationId,
    expectedVersion: number,
  ): Promise<void> {
    const { error } = await this.client.rpc(
      "organization_user_security_revoke",
      {
        p_organization_id: targetOrganizationId,
        p_actor_user_id: this.actorUserId,
        p_user_id: targetUserId,
        p_expected_version: expectedVersion,
      },
    );
    if (error) throw mapFailure(error);
  }
  private async readMany(
    rpc: string,
    args: Record<string, unknown>,
  ): Promise<readonly OrganizationalUser[]> {
    const { data, error } = await this.client.rpc(rpc, args);
    if (error) throw mapFailure(error);
    const rows = decode(rowSchema.array(), data);
    if (
      rows.some(
        (row) =>
          row.organization_id !== args.p_organization_id ||
          (args.p_user_id !== undefined && row.user_id !== args.p_user_id),
      )
    )
      throw malformed();
    return rows.map(mapRow);
  }
  private async mutate(
    rpc: string,
    args: Record<string, unknown>,
  ): Promise<OrganizationalUser> {
    const { data, error } = await this.client.rpc(rpc, args).single();
    if (error) throw mapFailure(error);
    const row = decode(rowSchema, data);
    if (
      row.organization_id !== args.p_organization_id ||
      row.user_id !== args.p_user_id
    )
      throw malformed();
    return mapRow(row);
  }
}

/** Resolves only existing global identities for a local assignment. */
export class SupabaseUserIdentityDirectory implements UserIdentityDirectory {
  /**
   * Creates a directory for resolving existing global identities.
   * @param client - Service-role client used for the identity lookup RPC.
   * @returns A directory that only reads identities.
   */
  constructor(private readonly client: SupabaseClient) {}
  /** {@inheritDoc UserIdentityDirectory.findById} */
  async findById(targetUserId: UserId) {
    const { data, error } = await this.client
      .rpc("organization_user_security_identity", { p_user_id: targetUserId })
      .maybeSingle();
    if (error) throw mapFailure(error);
    if (!data) return null;
    const row = decode(identitySchema, data);
    if (row.id !== targetUserId) throw malformed();
    return {
      id: userId(row.id),
      email: row.email,
      displayName: row.display_name,
    };
  }
}

/** Reads a permission-derived priority ceiling; command input never supplies this authority. */
export class SupabaseUserAdministrationAuthorizer implements UserAdministrationAuthorizer {
  /**
   * Creates the trusted authority resolver for user administration.
   * @param client - Service-role client used for authorization RPCs.
   * @returns An authorizer that derives priority ceilings from persisted grants.
   */
  constructor(private readonly client: SupabaseClient) {}
  /** {@inheritDoc UserAdministrationAuthorizer.authorizeUserAdministration} */
  async authorizeUserAdministration(
    actorUserId: UserId,
    targetOrganizationId: OrganizationId,
  ) {
    const { data, error } = await this.client
      .rpc("organization_user_security_authorize", {
        p_organization_id: targetOrganizationId,
        p_actor_user_id: actorUserId,
      })
      .single();
    if (error) throw mapFailure(error);
    const row = decode(authoritySchema, data);
    if (row.organization_id !== targetOrganizationId) throw malformed();
    return {
      organizationId: organizationId(row.organization_id),
      maximumAssignablePriority: row.maximum_assignable_priority,
    };
  }
}
function mapRow(row: z.infer<typeof rowSchema>): OrganizationalUser {
  return {
    organizationId: organizationId(row.organization_id),
    userId: userId(row.user_id),
    email: row.email,
    displayName: row.display_name,
    administrativePriority: row.administrative_priority,
    allowedCompanyIds: row.allowed_company_ids.map(companyId),
    status:
      row.status === "active"
        ? MembershipStatus.Active
        : MembershipStatus.Suspended,
    version: row.version,
  };
}
function malformed(): UserAdministrationFailure {
  return new UserAdministrationFailure(
    "ORGANIZATIONAL_USER_DATA_INVALID",
    "La persistencia devolvió datos de usuario inválidos o de otro ámbito.",
  );
}
function decode<T>(schema: z.ZodType<T>, data: unknown): T {
  const decoded = schema.safeParse(data);
  if (!decoded.success) throw malformed();
  return decoded.data;
}
function mapFailure(error: { message?: string }): UserAdministrationFailure {
  const message = error.message ?? "";
  for (const code of [
    "ORGANIZATIONAL_USER_NOT_FOUND",
    "ORGANIZATIONAL_USER_ALREADY_EXISTS",
    "ORGANIZATIONAL_USER_VERSION_CONFLICT",
    "ORGANIZATIONAL_USER_DATA_INVALID",
    "ORGANIZATIONAL_USER_COMPANY_INVALID",
    "ORGANIZATIONAL_USER_PRIORITY_INVALID",
    "ORGANIZATIONAL_USER_PRIORITY_ESCALATION",
    "ORGANIZATIONAL_USER_ACCESS_DENIED",
  ] as const)
    if (message.includes(code))
      return new UserAdministrationFailure(code, code);
  return new UserAdministrationFailure(
    "ORGANIZATIONAL_USER_ACCESS_DENIED",
    "No se pudo administrar el usuario de la organización.",
    { cause: error },
  );
}
