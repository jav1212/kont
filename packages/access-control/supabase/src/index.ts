import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { EvaluateAuthorization, RequireAuthorization, type AccessControlAdministration, type AccessControlRepository, type AuthorizationAudit } from "@kontave/access-control-application";
import { Role, membershipId, permissionCode, roleId, type AuthorizationDecision, type AuthorizationRequest, type AuthorizationSnapshot, type PermissionCode } from "@kontave/access-control-domain";
import { authorizationSnapshotRowSchema, roleRowSchema, type RoleRow } from "./persistence-codecs";

export interface AccessControlSupabaseConfiguration { readonly url: string; readonly serviceRoleKey: string }
export function createSupabaseAuthorization(configuration: AccessControlSupabaseConfiguration) {
  const client = createClient(configuration.url, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const repository = new SupabaseAccessControlRepository(client);
  const audit = new SupabaseAuthorizationAudit(client);
  const evaluate = new EvaluateAuthorization(repository, audit);
  return { repository, administration: new SupabaseAccessControlAdministration(client), audit, evaluate, require: new RequireAuthorization(evaluate) };
}
export class SupabaseAccessControlRepository implements AccessControlRepository {
  constructor(private readonly client: SupabaseClient) {}
  async findSnapshot(userId: string, organizationId: string): Promise<AuthorizationSnapshot | null> {
    const { data, error } = await this.client.from("organization_memberships").select(`id,status,authorization_version,organization_id,organizations(status),organization_roles(id,organization_id,code,name,description,kind,status,version,organization_role_permissions(permission_code))`).eq("user_id", userId).eq("organization_id", organizationId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = authorizationSnapshotRowSchema.parse(data);
    return { membershipId: membershipId(row.id), membershipStatus: row.status, authorizationVersion: row.authorization_version, organizationStatus: row.organizations.status, role: mapRole(row.organization_roles) };
  }
}
export class SupabaseAuthorizationAudit implements AuthorizationAudit {
  constructor(private readonly client: SupabaseClient) {}
  async record(request: AuthorizationRequest, decision: AuthorizationDecision, snapshot: AuthorizationSnapshot | null): Promise<void> {
    const { error } = await this.client.from("organization_authorization_audit").insert({ organization_id: request.actor.organizationId, user_id: request.actor.userId, membership_id: snapshot?.membershipId ?? request.actor.membershipId ?? null, role_id: snapshot?.role.id ?? null, permission_code: request.permission, effective_permissions: snapshot?.role.permissions ?? [], policy_name: decision.matchedPolicy ?? null, policy_version: decision.policyVersion ?? null, resource_type: request.resource?.type ?? null, resource_id: request.resource?.id ?? null, company_id: request.resource?.companyId ?? null, request_id: request.context.requestId, source: request.context.source, decision: decision.allowed ? "allow" : "deny", reason: decision.reason, occurred_at: request.context.occurredAt, metadata: {} });
    if (error) throw error;
  }
}
export class SupabaseAccessControlAdministration implements AccessControlAdministration {
  constructor(private readonly client: SupabaseClient) {}
  async findRole(targetRoleId: ReturnType<typeof roleId>): Promise<Role | null> {
    const { data, error } = await this.client.from("organization_roles").select("id,organization_id,code,name,description,kind,status,version,organization_role_permissions(permission_code)").eq("id", targetRoleId).maybeSingle();
    if (error) throw error; if (!data) return null;
    return mapRole(roleRowSchema.parse(data));
  }
  async countActiveMemberships(targetRoleId: ReturnType<typeof roleId>) { const { count, error } = await this.client.from("organization_memberships").select("id", { count: "exact", head: true }).eq("role_id", targetRoleId).eq("status", "active"); if (error) throw error; return count ?? 0; }
  async assignRole(targetMembershipId: string, targetRoleId: ReturnType<typeof roleId>) { const { error } = await this.client.rpc("access_control_assign_membership_role", { p_membership_id: targetMembershipId, p_role_id: targetRoleId }); if (error) throw error; }
  async replacePermissions(targetRoleId: ReturnType<typeof roleId>, permissions: readonly PermissionCode[]) { const { error } = await this.client.rpc("access_control_replace_role_permissions", { p_role_id: targetRoleId, p_permissions: permissions }); if (error) throw error; }
  async archiveRole(targetRoleId: ReturnType<typeof roleId>) { const { error } = await this.client.from("organization_roles").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", targetRoleId).eq("kind", "custom"); if (error) throw error; }
}
function mapRole(row: RoleRow): Role { return new Role({ id: roleId(row.id), organizationId: row.organization_id, code: row.code, name: row.name, description: row.description, kind: row.kind, status: row.status, version: row.version, permissions: row.organization_role_permissions.map((item) => permissionCode(item.permission_code)) }); }
export type { PermissionCode };
