import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  OrganizationDirectory,
  OrganizationPresentationDirectory,
} from "@kontave/organizations-application";
import {
  OrganizationFailure,
  OrganizationRole,
  companyId,
  organizationId,
  userId,
  type CompanyId,
  type OrganizationAccess,
  type OrganizationCompany,
  type OrganizationId,
  type Permission,
  type UserId,
} from "@kontave/organizations-domain";
import {
  companyRowSchema,
  membershipRowSchema,
  organizationOwnerRowSchema,
  organizationPresentationRowSchema,
  organizationRowSchema,
  profilePresentationRowSchema,
  type CompanyRow,
} from "./persistence-codecs";

export interface OrganizationsSupabaseConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

export function createOrganizationsDirectory(
  configuration: OrganizationsSupabaseConfiguration,
): OrganizationDirectory & OrganizationPresentationDirectory {
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabaseOrganizationDirectory(client);
}

class SupabaseOrganizationDirectory implements OrganizationDirectory, OrganizationPresentationDirectory {
  constructor(private readonly client: SupabaseClient) {}

  async listAccessForUser(targetUserId: UserId): Promise<readonly OrganizationAccess[]> {
    try {
      const { data: membershipData, error: membershipError } = await this.client
        .from("organization_memberships")
        .select("organization_id,user_id,role,status")
        .eq("user_id", targetUserId)
        .eq("status", "active");
      if (membershipError) throw membershipError;
      const memberships = membershipRowSchema.array().parse(membershipData ?? []);
      if (memberships.length === 0) return [];

      const { data: organizationData, error: organizationError } = await this.client
        .from("organizations")
        .select("id,name,slug,status")
        .in("id", memberships.map((membership) => membership.organization_id));
      if (organizationError) throw organizationError;
      const organizations = new Map(organizationRowSchema.array().parse(organizationData ?? []).map((row) => [row.id, row]));
      const permissions = await this.loadPermissions(memberships.map((membership) => membership.role));

      return memberships.flatMap((membership): OrganizationAccess[] => {
        const organization = organizations.get(membership.organization_id);
        if (!organization) return [];
        const role = mapRole(membership.role);
        return [{
          organization: {
            id: organizationId(organization.id),
            name: organization.name,
            slug: organization.slug,
            status: organization.status,
          },
          membership: {
            organizationId: organizationId(membership.organization_id),
            userId: userId(membership.user_id),
            role,
            status: membership.status,
            permissions: role === OrganizationRole.Owner ? ["*"] : permissions.get(role) ?? [],
          },
        }];
      });
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }

  async findAccess(targetUserId: UserId, targetOrganizationId: OrganizationId): Promise<OrganizationAccess | null> {
    const access = await this.listAccessForUser(targetUserId);
    return access.find((entry) => entry.organization.id === targetOrganizationId) ?? null;
  }

  async listByOrganizationIds(
    targetOrganizationIds: readonly OrganizationId[],
  ): Promise<readonly { organizationId: OrganizationId; avatarUrl: string | null }[]> {
    if (targetOrganizationIds.length === 0) return [];
    try {
      const { data, error } = await this.client
        .from("organizations")
        .select("id,avatar_url")
        .in("id", [...new Set(targetOrganizationIds)]);
      if (error) throw error;
      const organizations = organizationPresentationRowSchema.array().parse(data ?? []);
      const missingBranding = organizations.filter((row) => !row.avatar_url).map((row) => row.id);
      const legacyAvatars = await this.loadLegacyOwnerAvatars(missingBranding);
      return organizations.map((row) => ({
        organizationId: organizationId(row.id),
        // Migrated Web tenants historically used the owner's profile avatar as
        // their visual identity. Preserve that presentation until explicit
        // organization branding is configured.
        avatarUrl: row.avatar_url ?? legacyAvatars.get(row.id) ?? null,
      }));
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }

  private async loadLegacyOwnerAvatars(
    organizationIds: readonly string[],
  ): Promise<ReadonlyMap<string, string | null>> {
    if (organizationIds.length === 0) return new Map();
    const { data: ownerData, error: ownerError } = await this.client
      .from("organization_memberships")
      .select("organization_id,user_id")
      .in("organization_id", [...new Set(organizationIds)])
      .eq("role", OrganizationRole.Owner)
      .eq("status", "active");
    if (ownerError) throw ownerError;
    const owners = organizationOwnerRowSchema.array().parse(ownerData ?? []);
    if (owners.length === 0) return new Map();

    const { data: profileData, error: profileError } = await this.client
      .from("profiles")
      .select("id,avatar_url")
      .in("id", [...new Set(owners.map((row) => row.user_id))]);
    if (profileError) throw profileError;
    const profiles = new Map(
      profilePresentationRowSchema.array().parse(profileData ?? []).map((row) => [row.id, row.avatar_url]),
    );
    return new Map(owners.map((owner) => [owner.organization_id, profiles.get(owner.user_id) ?? null]));
  }

  async listCompanies(targetOrganizationId: OrganizationId): Promise<readonly OrganizationCompany[]> {
    try {
      const { data, error } = await this.client
        .from("shared_companies")
        .select("organization_id,id,name,rif")
        .eq("organization_id", targetOrganizationId)
        .order("name", { ascending: true });
      if (error) throw error;
      return companyRowSchema.array().parse(data ?? []).map(mapCompany);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }

  async findCompany(targetOrganizationId: OrganizationId, targetCompanyId: CompanyId): Promise<OrganizationCompany | null> {
    try {
      const { data, error } = await this.client
        .from("shared_companies")
        .select("organization_id,id,name,rif")
        .eq("organization_id", targetOrganizationId)
        .eq("id", targetCompanyId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapCompany(companyRowSchema.parse(data)) : null;
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }

  private async loadPermissions(databaseRoles: readonly string[]): Promise<Map<OrganizationRole, readonly Permission[]>> {
    const legacyRoles = [...new Set(databaseRoles.map(mapRole).filter((role) => role !== OrganizationRole.Owner).map(toLegacyRole))];
    if (legacyRoles.length === 0) return new Map();
    const { data, error } = await this.client
      .from("shared_authorization_role_permissions")
      .select("role,permission_code")
      .in("role", legacyRoles);
    if (error) throw error;
    const result = new Map<OrganizationRole, Permission[]>();
    for (const row of (data ?? []) as Array<{ role: string; permission_code: string }>) {
      const role = mapRole(row.role);
      const current = result.get(role) ?? [];
      current.push(row.permission_code as Permission);
      result.set(role, current);
    }
    return result;
  }
}

function mapCompany(row: CompanyRow): OrganizationCompany {
  return { id: companyId(row.id), organizationId: organizationId(row.organization_id), name: row.name, rif: row.rif };
}

function mapRole(role: string): OrganizationRole {
  const mapped = DATABASE_ROLE_MAP.get(role);
  if (mapped) return mapped;
  throw new OrganizationFailure("ORGANIZATION_REPOSITORY_UNAVAILABLE", "La organización contiene un rol desconocido.");
}

const DATABASE_ROLE_MAP = new Map<string, OrganizationRole>([["owner",OrganizationRole.Owner],["admin",OrganizationRole.Admin],["accountant",OrganizationRole.Accountant],["contador",OrganizationRole.Accountant],["contable",OrganizationRole.Accountant],["seller",OrganizationRole.Seller],["vendedor",OrganizationRole.Seller],["cashier",OrganizationRole.Cashier],["cajero",OrganizationRole.Cashier]]);
const LEGACY_ROLE_MAP = new Map<OrganizationRole,string>([[OrganizationRole.Owner,"owner"],[OrganizationRole.Admin,"admin"],[OrganizationRole.Accountant,"contador"],[OrganizationRole.Seller,"vendedor"],[OrganizationRole.Cashier,"cajero"]]);
function toLegacyRole(role: OrganizationRole): string { const mapped=LEGACY_ROLE_MAP.get(role); if (!mapped) throw new OrganizationFailure("ORGANIZATION_REPOSITORY_UNAVAILABLE", "No existe traducción para el rol."); return mapped; }

function repositoryFailure(cause: unknown): OrganizationFailure {
  if (cause instanceof OrganizationFailure) return cause;
  return new OrganizationFailure(
    "ORGANIZATION_REPOSITORY_UNAVAILABLE",
    "No se pudo consultar la información de la organización.",
    { cause },
  );
}
