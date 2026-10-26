import "server-only";
import { DelegatedAccessFailure, OrganizationAccessPathKind } from "@kontave/delegated-access/domain";
import { PERMISSIONS, permissionCode, AuthorizationDenied, AuthorizationSource } from "@kontave/access-control/domain";
import { createSupabaseAuthorization } from "@kontave/access-control/supabase";
import { companyId as asCompanyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { DelegatedPermissionScopePolicy } from "@kontave/workspace-context-application";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { AccountingFailure } from "@kontave/accounting/domain";
import type { AccountingWriteCommand, FindAccountsQuery, GetAccountQuery, ListChartsQuery } from "@kontave/accounting/application";
import { createAccountingActions } from "@/src/modules/accounting/backend/accounting-factory";
import { withWebAuditContext } from "@/src/modules/security/backend/web-audit-context";
import { authenticateClientRequest } from "../auth/auth-context";
import { createCompanyActions } from "../companies/company-actions";
import { createOrganizationAccessActions } from "../organization-access/organization-access-actions";
import { apiError, apiSuccess } from "../http/response";

type Operation = "commands" | "query";
const scopeKeys = new Set(["tenantId", "organizationId", "companyId", "actorId"]);
const chartCommands = new Set(["create_chart","change_chart_structure","activate_chart","archive_chart","create_account","update_account","recode_account","set_account_active","delete_account","convert_account_kind","set_account_classification","pair_memorandum_accounts","unpair_memorandum_accounts"]);
const masterCommands = new Set(["create_cost_center","set_cost_center_active","upsert_expense_class","upsert_accounting_attribute","upsert_attribute_value","set_account_dimensions","set_auxiliary_source_enabled","upsert_other_auxiliary","set_other_auxiliary_active"]);
const configureCommands = new Set(["upsert_document_type","set_special_account","save_accounting_settings"]);

/** Authenticates and scopes one chart, master, or configuration SQL operation.
 * @param request - Bearer-authenticated client request with a scope-free command or query.
 * @param rawOrganizationId - Organization selected in the route.
 * @param rawCompanyId - Company selected in the route.
 * @param operation - SQL command or query boundary.
 * @returns Standard client API JSON response.
 * @throws Never; expected errors are returned as typed HTTP responses.
 */
export async function executeAccountingRequest(request: Request, rawOrganizationId: string, rawCompanyId: string, operation: Operation): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateClientRequest(request);
    if (!identity) return apiError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    const orgId = organizationId(rawOrganizationId);
    const company = asCompanyId(rawCompanyId);
    const access = (await createOrganizationAccessActions().portfolio.execute(userId(identity.userId), new Date().toISOString())).find((item) => item.organizationId === orgId);
    if (!access) return apiError("ACCOUNTING_ACCESS_DENIED", "No tienes acceso a esta empresa.", requestId, 403);
    await createCompanyActions().getOperational.execute(orgId, company);
    const server = new ServerSupabaseSource();
    const organization = await server.instance.from("organizations").select("legacy_tenant_id").eq("id", orgId).maybeSingle();
    if (organization.error) throw organization.error;
    const tenantId = organization.data?.legacy_tenant_id;
    if (!tenantId) return apiError("ORGANIZATION_NOT_FOUND", "La organización no tiene una empresa operativa asociada.", requestId, 404);
    let body: unknown;
    try { body = await request.json(); } catch { return apiError("ACCOUNTING_INVALID", "El cuerpo JSON contable no es válido.", requestId, 400); }
    if (!isRecord(body) || Object.keys(body).some((key) => scopeKeys.has(key))) return apiError("ACCOUNTING_INVALID", "La solicitud contable no es válida.", requestId, 400);
    const required = operation === "query" ? PERMISSIONS.ACCOUNTING_READ : commandPermission(body.kind);
    if (!required) return apiError("ACCOUNTING_INVALID", "El comando contable no está soportado.", requestId, 400);
    const code = typeof required === "string" ? permissionCode(required) : required;
    if (!new DelegatedPermissionScopePolicy().permits(access.accessPath, code)) return apiError("ACCOUNTING_ACCESS_DENIED", "No tienes permiso para esta operación contable.", requestId, 403);
    if (access.accessPath.kind === OrganizationAccessPathKind.DirectMembership) {
      await createSupabaseAuthorization({ url: process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! }).require.execute({ actor: { userId: identity.userId, organizationId: orgId }, permission: code, resource: { type: "accounting", organizationId: orgId, companyId: company }, context: { requestId, source: AuthorizationSource.Web, occurredAt: new Date().toISOString() } });
    }
    const scope = { actorId: identity.userId, tenantId, organizationId: orgId, companyId: company, authorizationMode: access.accessPath.kind === OrganizationAccessPathKind.DirectMembership ? "direct" : "delegated" };
    const functionName = operation === "commands" ? "shared_accounting_execute_command" : "shared_accounting_query";
    const functionArgs = operation === "commands" ? { p_scope: scope, p_command: body } : { p_scope: scope, p_query: body };
    const result = await withWebAuditContext<unknown>({ actorId: identity.userId, tenantId, permission: code, deviceId: request.headers.get("x-kontave-device-name") ?? undefined }, async () => {
      const actions = createAccountingActions(server.instance, async (_scope, _permission) => undefined);
      if (operation === "commands" && typeof body.kind === "string" && chartCommands.has(body.kind)) {
        return actions.command.execute({ ...body, ...scope } as unknown as AccountingWriteCommand);
      }
      if (operation === "query") {
        const scoped = { ...body, ...scope };
        if (body.kind === "list_charts") return actions.queries.listCharts(scoped as unknown as ListChartsQuery);
        if (body.kind === "find_accounts") return actions.queries.findAccounts(scoped as unknown as FindAccountsQuery);
        if (body.kind === "get_account") return actions.queries.getAccount(scoped as unknown as GetAccountQuery);
      }
      const rpc = await server.instance.rpc(functionName, functionArgs);
      if (rpc.error) throw rpc.error;
      return rpc.data;
    });
    return apiSuccess(result, requestId);
  } catch (cause) {
    if (cause instanceof AuthorizationDenied || cause instanceof DelegatedAccessFailure) return apiError("ACCOUNTING_ACCESS_DENIED", "No tienes acceso a esta operación contable.", requestId, 403);
    if (cause instanceof AccountingFailure) {
      const status = cause.code === "INVALID" ? 400 : cause.code === "FORBIDDEN" ? 403 : cause.code === "NOT_FOUND" ? 404 : cause.code === "UNAVAILABLE" ? 503 : 409;
      return apiError(cause.code === "INVALID" ? "ACCOUNTING_INVALID" : cause.code === "FORBIDDEN" ? "ACCOUNTING_ACCESS_DENIED" : "ACCOUNTING_CONFLICT", cause.message, requestId, status);
    }
    console.error("client.accounting.failed", { requestId, operation, cause });
    return apiError("INTERNAL_ERROR", "No se pudo procesar la solicitud contable.", requestId, 500);
  }
}

function commandPermission(kind: unknown): string | undefined {
  if (typeof kind !== "string") return undefined;
  if (chartCommands.has(kind)) return "accounting.chart.manage";
  if (masterCommands.has(kind)) return "accounting.masters.manage";
  if (configureCommands.has(kind)) return "accounting.configure";
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
