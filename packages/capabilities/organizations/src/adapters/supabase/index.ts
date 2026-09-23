import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  OrganizationPresentationDirectory,
  OrganizationLogoStorage,
  OrganizationRepository,
  OrganizationMembersRepository,
} from "../../application";
import {
  OrganizationFailure,
  DirectOrganizationRelationship,
  OrganizationRole,
  companyId,
  organizationId,
  userId,
  type CompanyId,
  type OrganizationAccess,
  type OrganizationCompany,
  type OrganizationId,
  type UserId,
} from "../../domain";
import { z } from "zod";
import {
  companyRowSchema,
  assignedOrganizationRoleSchema,
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

const memberProjectionSchema=z.object({id:z.string(),kind:z.enum(["membership","invitation"]),organization_id:z.string(),user_id:z.string().nullable(),email:z.string(),display_name:z.string().nullable(),avatar_url:z.string().nullable(),role_id:z.string(),role_name:z.string(),status:z.enum(["active","invited","suspended"]),version:z.number().int().positive(),joined_at:z.string().nullable(),invited_at:z.string().nullable(),expires_at:z.string().nullable()});
const invitationResultSchema=z.object({member:memberProjectionSchema,created:z.boolean()});
export class SupabaseOrganizationMembersRepository implements OrganizationMembersRepository{
 constructor(private readonly client:SupabaseClient){}
 async list(id:OrganizationId){const{data,error}=await this.client.rpc("list_organization_members_native",{p_organization_id:id});if(error)throw memberFailure(error);return memberProjectionSchema.array().parse(data??[]).map(mapMember)}
 async invite(input:Parameters<OrganizationMembersRepository["invite"]>[0]){const{data,error}=await this.client.rpc("invite_organization_member_native",{p_organization_id:input.organizationId,p_actor_user_id:input.actorUserId,p_email:input.email,p_role_id:input.roleId,p_raw_token:input.rawToken,p_token_hash:input.tokenHash,p_idempotency_key:input.idempotencyKey,p_expires_at:input.expiresAt}).single();if(error)throw memberFailure(error);const result=invitationResultSchema.parse(data);return{member:mapMember(result.member),created:result.created}}
 async resend(input:Parameters<OrganizationMembersRepository["resend"]>[0]){const{data,error}=await this.client.rpc("resend_organization_invitation_native",{p_organization_id:input.organizationId,p_actor_user_id:input.actorUserId,p_invitation_id:input.invitationId,p_raw_token:input.rawToken,p_token_hash:input.tokenHash,p_expires_at:input.expiresAt,p_expected_version:input.expectedVersion}).single();if(error)throw memberFailure(error);return mapMember(memberProjectionSchema.parse(data))}
 async revokeInvitation(input:Parameters<OrganizationMembersRepository["revokeInvitation"]>[0]){const{error}=await this.client.rpc("revoke_organization_invitation_native",{p_organization_id:input.organizationId,p_actor_user_id:input.actorUserId,p_invitation_id:input.invitationId,p_expected_version:input.expectedVersion});if(error)throw memberFailure(error)}
 async update(input:Parameters<OrganizationMembersRepository["update"]>[0]){const{data,error}=await this.client.rpc("update_organization_membership_native",{p_organization_id:input.organizationId,p_actor_user_id:input.actorUserId,p_membership_id:input.membershipId,p_role_id:input.roleId,p_status:input.status,p_expected_version:input.expectedVersion,p_update_role:input.roleId!==undefined,p_update_status:input.status!==undefined}).single();if(error)throw memberFailure(error);return mapMember(memberProjectionSchema.parse(data))}
 async revoke(input:Parameters<OrganizationMembersRepository["revoke"]>[0]){const{error}=await this.client.rpc("revoke_organization_membership_native",{p_organization_id:input.organizationId,p_actor_user_id:input.actorUserId,p_membership_id:input.membershipId,p_expected_version:input.expectedVersion});if(error)throw memberFailure(error)}
}
export function createOrganizationMembersRepository(configuration:OrganizationsSupabaseConfiguration){return new SupabaseOrganizationMembersRepository(createClient(configuration.url,configuration.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}))}
function mapMember(row:z.infer<typeof memberProjectionSchema>){return{id:row.id,kind:row.kind,organizationId:organizationId(row.organization_id),userId:row.user_id?userId(row.user_id):null,email:row.email,displayName:row.display_name,avatarUrl:row.avatar_url,roleId:row.role_id,roleName:row.role_name,status:row.status,version:row.version,joinedAt:row.joined_at,invitedAt:row.invited_at,expiresAt:row.expires_at}}
function memberFailure(error:{message?:string}){const message=error.message??"";for(const[code,label]of [["ORGANIZATION_ACCESS_DENIED","No tienes permiso para administrar miembros."],["MEMBERSHIP_NOT_FOUND","La membresía no existe."],["MEMBERSHIP_VERSION_CONFLICT","La membresía cambió en otro cliente."],["INVITATION_VERSION_CONFLICT","La invitación cambió en otro cliente."],["INVITATION_ALREADY_PENDING","Ya existe una invitación pendiente."],["INVITATION_INVALID","La invitación no es válida."],["INVITATION_NOT_FOUND","La invitación no existe."]]as const)if(message.includes(code))return new OrganizationFailure(code,label);return repositoryFailure(error)}

export function createOrganizationsDirectory(
  configuration: OrganizationsSupabaseConfiguration,
): OrganizationRepository & OrganizationPresentationDirectory {
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabaseOrganizationDirectory(client);
}

class SupabaseOrganizationDirectory implements OrganizationRepository, OrganizationPresentationDirectory {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Resolves memberships against their assigned, organization-scoped role grants.
   * @param targetUserId Authenticated user whose memberships should be inspected.
   * @returns Memberships with active assigned roles; unresolved roles fail closed.
   * @throws OrganizationFailure when persistence or row validation fails.
   */
  async listAccessForUser(targetUserId: UserId): Promise<readonly OrganizationAccess[]> {
    try {
      const { data: membershipData, error: membershipError } = await this.client
        .from("organization_memberships")
        .select("organization_id,user_id,role,role_id,status")
        .eq("user_id", targetUserId)
        .eq("status", "active");
      if (membershipError) throw membershipError;
      const memberships = membershipRowSchema.array().parse(membershipData ?? []);
      if (memberships.length === 0) return [];

      const { data: organizationData, error: organizationError } = await this.client
        .from("organizations")
        .select("id,legacy_tenant_id,name,slug,status,avatar_url,version")
        .in("id", memberships.map((membership) => membership.organization_id));
      if (organizationError) throw organizationError;
      const organizations = new Map(organizationRowSchema.array().parse(organizationData ?? []).map((row) => [row.id, row]));
      const assignedRoleIds = memberships.flatMap((membership) => membership.role_id ? [membership.role_id] : []);
      if (assignedRoleIds.length === 0) return [];
      const { data: roleData, error: roleError } = await this.client
        .from("organization_roles")
        .select("id,organization_id,code,kind,status,organization_role_permissions(permission_code)")
        .in("id", [...new Set(assignedRoleIds)]);
      if (roleError) throw roleError;
      const assignedRoles = new Map(assignedOrganizationRoleSchema.array().parse(roleData ?? []).map((role) => [role.id, role]));

      return memberships.flatMap((membership): OrganizationAccess[] => {
        const organization = organizations.get(membership.organization_id);
        if (!organization) return [];
        const assignedRole = membership.role_id ? assignedRoles.get(membership.role_id) : undefined;
        // Access follows the assigned role in this organization, never the
        // legacy role-permission matrix shared by unrelated organizations.
        if (!assignedRole || assignedRole.status !== "active"
          || assignedRole.organization_id !== membership.organization_id) return [];
        const role = mapRole(membership.role);
        const isAssignedOwner = role === OrganizationRole.Owner
          && assignedRole.kind === "system" && assignedRole.code === "owner";
        return [{
          relationship: organization.legacy_tenant_id === targetUserId
            ? DirectOrganizationRelationship.Personal
            : DirectOrganizationRelationship.Member,
          organization: {
            id: organizationId(organization.id),
            name: organization.name,
            slug: organization.slug,
            status: organization.status,
            logoUrl: organization.avatar_url,
            version: organization.version,
          },
          membership: {
            organizationId: organizationId(membership.organization_id),
            userId: userId(membership.user_id),
            role,
            status: membership.status,
            permissions: isAssignedOwner ? ["*"] : assignedRole.organization_role_permissions.map((permission) => permission.permission_code),
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

  async update(targetOrganizationId: OrganizationId, changes: { readonly name?: string; readonly logoUrl?: string | null }, expectedVersion: number) {
    const { data, error } = await this.client.rpc("update_organization_native", {
      p_organization_id: targetOrganizationId,
      p_expected_version: expectedVersion,
      p_name: changes.name,
      p_logo_url: changes.logoUrl,
      p_update_name: changes.name !== undefined,
      p_update_logo_url: changes.logoUrl !== undefined,
    }).single();
    if (error) {
      if (error.code === "P0001" && error.message.includes("ORGANIZATION_VERSION_CONFLICT")) throw new OrganizationFailure("ORGANIZATION_VERSION_CONFLICT", "La organización cambió en otro cliente.");
      throw repositoryFailure(error);
    }
    const row = organizationRowSchema.parse(data);
    return { id: organizationId(row.id), name: row.name, slug: row.slug, status: row.status, logoUrl: row.avatar_url, version: row.version };
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
        .select("organization_id,id,name,rif,logo_url,operating_profile")
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
        .select("organization_id,id,name,rif,logo_url,operating_profile")
        .eq("organization_id", targetOrganizationId)
        .eq("id", targetCompanyId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapCompany(companyRowSchema.parse(data)) : null;
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }

}

export class SupabaseOrganizationLogoStorage implements OrganizationLogoStorage {
  private readonly client: SupabaseClient;
  constructor(configuration: OrganizationsSupabaseConfiguration) { this.client = createClient(configuration.url, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }); }
  async upload(targetOrganizationId: OrganizationId, logo: { readonly bytes: Uint8Array; readonly contentType: string }): Promise<string> {
    const extension = logo.contentType === "image/png" ? "png" : logo.contentType === "image/webp" ? "webp" : "jpg";
    const path = `${targetOrganizationId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await this.client.storage.from("organization-logos").upload(path, logo.bytes, { contentType: logo.contentType });
    if (error) throw new OrganizationFailure("ORGANIZATION_REPOSITORY_UNAVAILABLE", "No se pudo guardar el logo.", { cause: error });
    return this.client.storage.from("organization-logos").getPublicUrl(path).data.publicUrl;
  }
  async deleteByPublicUrl(targetOrganizationId: OrganizationId, publicUrl: string): Promise<void> {
    const marker = "/storage/v1/object/public/organization-logos/";
    const path = decodeURIComponent(new URL(publicUrl).pathname.split(marker)[1] ?? "");
    if (!path.startsWith(`${targetOrganizationId}/`)) return;
    const { error } = await this.client.storage.from("organization-logos").remove([path]);
    if (error) throw new OrganizationFailure("ORGANIZATION_REPOSITORY_UNAVAILABLE", "No se pudo eliminar el logo.", { cause: error });
  }
}

function mapCompany(row: CompanyRow): OrganizationCompany {
  return { id: companyId(row.id), organizationId: organizationId(row.organization_id), name: row.name, rif: row.rif, logoUrl: row.logo_url, operatingProfile: row.operating_profile };
}

function mapRole(role: string): OrganizationRole {
  const mapped = DATABASE_ROLE_MAP.get(role);
  if (mapped) return mapped;
  throw new OrganizationFailure("ORGANIZATION_REPOSITORY_UNAVAILABLE", "La organización contiene un rol desconocido.");
}

const DATABASE_ROLE_MAP = new Map<string, OrganizationRole>([["owner",OrganizationRole.Owner],["admin",OrganizationRole.Admin],["accountant",OrganizationRole.Accountant],["contador",OrganizationRole.Accountant],["contable",OrganizationRole.Accountant],["seller",OrganizationRole.Seller],["vendedor",OrganizationRole.Seller],["cashier",OrganizationRole.Cashier],["cajero",OrganizationRole.Cashier]]);

function repositoryFailure(cause: unknown): OrganizationFailure {
  if (cause instanceof OrganizationFailure) return cause;
  return new OrganizationFailure(
    "ORGANIZATION_REPOSITORY_UNAVAILABLE",
    "No se pudo consultar la información de la organización.",
    { cause },
  );
}
