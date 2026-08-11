import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationDirectory } from "@kontave/organizations-application";
import {
  OrganizationFailure,
  companyId,
  organizationId,
  userId,
  type CompanyId,
  type OrganizationAccess,
  type OrganizationCompany,
  type OrganizationId,
  type OrganizationRole,
  type Permission,
  type UserId,
} from "@kontave/organizations-domain";

export interface OrganizationsSupabaseConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

export function createOrganizationsDirectory(configuration: OrganizationsSupabaseConfiguration): OrganizationDirectory {
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabaseOrganizationDirectory(client);
}

type MembershipRow = { organization_id: string; user_id: string; role: string; status: string };
type OrganizationRow = { id: string; name: string; slug: string; status: string };
type CompanyRow = { organization_id: string; id: string; name: string; rif: string | null };

class SupabaseOrganizationDirectory implements OrganizationDirectory {
  constructor(private readonly client: SupabaseClient) {}

  async listAccessForUser(targetUserId: UserId): Promise<readonly OrganizationAccess[]> {
    try {
      const { data: membershipData, error: membershipError } = await this.client
        .from("organization_memberships")
        .select("organization_id,user_id,role,status")
        .eq("user_id", targetUserId)
        .eq("status", "active");
      if (membershipError) throw membershipError;
      const memberships = (membershipData ?? []) as MembershipRow[];
      if (memberships.length === 0) return [];

      const { data: organizationData, error: organizationError } = await this.client
        .from("organizations")
        .select("id,name,slug,status")
        .in("id", memberships.map((membership) => membership.organization_id));
      if (organizationError) throw organizationError;
      const organizations = new Map(((organizationData ?? []) as OrganizationRow[]).map((row) => [row.id, row]));
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
            status: organization.status === "active" ? "active" : "suspended",
          },
          membership: {
            organizationId: organizationId(membership.organization_id),
            userId: userId(membership.user_id),
            role,
            status: membership.status === "active" ? "active" : "suspended",
            permissions: role === "owner" ? ["*"] : permissions.get(role) ?? [],
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

  async listCompanies(targetOrganizationId: OrganizationId): Promise<readonly OrganizationCompany[]> {
    try {
      const { data, error } = await this.client
        .from("shared_companies")
        .select("organization_id,id,name,rif")
        .eq("organization_id", targetOrganizationId)
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as CompanyRow[]).map(mapCompany);
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
      return data ? mapCompany(data as CompanyRow) : null;
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }

  private async loadPermissions(databaseRoles: readonly string[]): Promise<Map<OrganizationRole, readonly Permission[]>> {
    const legacyRoles = [...new Set(databaseRoles.filter((role) => role !== "owner").map(toLegacyRole))];
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
  if (role === "owner" || role === "admin" || role === "seller" || role === "cashier" || role === "accountant") return role;
  if (role === "contador" || role === "contable") return "accountant";
  if (role === "vendedor") return "seller";
  if (role === "cajero") return "cashier";
  throw new OrganizationFailure("ORGANIZATION_REPOSITORY_UNAVAILABLE", "La organización contiene un rol desconocido.");
}

function toLegacyRole(role: string): string {
  const normalized = mapRole(role);
  if (normalized === "accountant") return "contador";
  if (normalized === "seller") return "vendedor";
  if (normalized === "cashier") return "cajero";
  return normalized;
}

function repositoryFailure(cause: unknown): OrganizationFailure {
  if (cause instanceof OrganizationFailure) return cause;
  return new OrganizationFailure(
    "ORGANIZATION_REPOSITORY_UNAVAILABLE",
    "No se pudo consultar la información de la organización.",
    { cause },
  );
}
