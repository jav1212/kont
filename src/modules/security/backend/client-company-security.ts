import { createClient } from "@supabase/supabase-js";
import { createSupabaseAuthorization } from "@kontave/access-control/supabase";
import { AuthorizationDenied, AuthorizationReason } from "@kontave/access-control/domain";
import { allowsWebCompany, allowsWebTarget, webSecurityScopeSchema } from "./web-operation-policy";

/**
 * Applies membership restrictions to company APIs also consumed by production Web.
 * Delegated access continues through its independent authorization boundary.
 * @param request Authenticated request whose path owns organization/company scope.
 * @param userId Verified provider identity, never a request-body value.
 * @param configuration Server-only persistence credentials.
 * @returns Nothing when this is not a company route or its membership permits access.
 * @throws AuthorizationDenied for a configured restriction; persistence errors propagate.
 */
export async function requireClientCompanySecurity(
  request: Request,
  userId: string,
  configuration: { url: string; serviceRoleKey: string },
): Promise<void> {
  const pathname = new URL(request.url).pathname;
  const match = /^\/api\/client\/v1\/organizations\/([^/]+)\/companies\/([^/]+)(?:\/([^/]+))?/.exec(pathname);
  if (!match) return;
  const organizationId = decodeURIComponent(match[1]!);
  const companyId = decodeURIComponent(match[2]!);
  const snapshot = await createSupabaseAuthorization(configuration).repository.findSnapshot(userId, organizationId);
  if (!snapshot) return;
  const client = createClient(configuration.url, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc("web_user_security_scope", { p_actor_id: userId, p_organization_id: organizationId, p_credential_session: true });
  if (error) {
    if (/ACCESS_DENIED|SECURITY_DENIED/.test(error.message)) throw denied();
    throw error;
  }
  const scope = webSecurityScopeSchema.parse(data);
  if (scope.organizationId !== organizationId || !allowsWebCompany(scope, companyId)) throw denied();
  const resource = match[3] === "products" ? "inventory" : match[3];
  if (resource && ["inventory", "sales", "purchases", "payroll", "accounting", "documents"].includes(resource)) {
    const targets = [
      { kind: "module", permission: "modules.access", id: resource },
      { kind: "table", permission: "tables.access", id: resource },
    ];
    if (/reporting|report|ledger|balance/.test(pathname)) targets.push({ kind: "report", permission: "reports.run", id: `${resource}.read` });
    if (targets.some((target) => !allowsWebTarget(scope, snapshot.role.permissions, target, companyId))) throw denied();
  }
}

function denied(): AuthorizationDenied {
  return new AuthorizationDenied({ allowed: false, reason: AuthorizationReason.PolicyDenied });
}
