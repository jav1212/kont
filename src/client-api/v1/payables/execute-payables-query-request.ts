import "server-only";
import { createClient } from "@supabase/supabase-js";
import { AuthorizationDenied, AuthorizationSource, PERMISSIONS, permissionCode } from "@kontave/access-control/domain";
import { DelegatedAccessFailure, OrganizationAccessPathKind } from "@kontave/delegated-access/domain";
import { DelegatedPermissionScopePolicy } from "@kontave/workspace-context-application";
import { PayablesFailure } from "@kontave/payables/domain";
import type { PayablesReportFilter, PayablesReportKind } from "@kontave/payables/application";
import { organizationId, userId } from "@kontave/organizations/domain";
import { companyId } from "@kontave/companies/domain";
import { createSupabaseAuthorization } from "@kontave/access-control/supabase";
import { createOrganizationAccessActions } from "../organization-access/organization-access-actions";
import { authenticateClientRequest } from "../auth/auth-context";
import { apiError, apiSuccess } from "../http/response";
import { createPayablesActions } from "@/src/modules/payables/backend/payables-factory";

type PayablesQueryPayload = Partial<Record<PayablesReportFilter, string>> & {
  readonly organizationId: string;
  readonly companyId: string;
  readonly kind: PayablesReportKind;
  readonly supplierId?: string;
  readonly documentId?: string;
  readonly asOf?: string;
  readonly from?: string;
  readonly to?: string;
  readonly status?: string;
  readonly limit?: number;
  readonly offset?: number;
};

/** Authenticates, authorizes and executes one company-scoped payables read report.
 * @param request - Authenticated JSON request with organization, company and report filters, or only the filters when the scope comes from the route.
 * @param routeScope - Organization and company from a client API route; caller-supplied scope is then rejected.
 * @returns No-store API success or typed access/validation failure.
 * @throws Never; operational failures are translated into HTTP responses.
 */
export async function executePayablesQueryRequest(request: Request, routeScope?: { readonly organizationId: string; readonly companyId: string }): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateClientRequest(request);
    if (!identity) return apiError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    const body: unknown = await request.json();
    if (routeScope && body && typeof body === "object" && ("organizationId" in body || "companyId" in body)) return apiError("INVALID_REQUEST", "La consulta no puede incluir alcance.", requestId, 400);
    const payload: unknown = routeScope && body && typeof body === "object" ? { ...body, ...routeScope } : body;
    if (!isPayload(payload)) return apiError("INVALID_REQUEST", "La consulta de CxP no es válida.", requestId, 400);
    const organization = organizationId(payload.organizationId);
    const company = companyId(payload.companyId);
    const permission = permissionCode(PERMISSIONS.PAYABLES_READ);
    const occurredAt = new Date().toISOString();
    const access = (await createOrganizationAccessActions().portfolio.execute(userId(identity.userId), occurredAt))
      .find((entry) => entry.organizationId === organization);
    if (!access || !new DelegatedPermissionScopePolicy().permits(access.accessPath, permission))
      return apiError("COMPANY_ACCESS_DENIED", "No tienes acceso a las cuentas por pagar de esta empresa.", requestId, 403);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) throw new Error("Payables server infrastructure is not configured.");
    if (access.accessPath.kind === OrganizationAccessPathKind.DirectMembership) {
      await createSupabaseAuthorization({ url, serviceRoleKey }).require.execute({
        actor: { userId: identity.userId, organizationId: organization }, permission,
        resource: { type: "payables_report", organizationId: organization, companyId: company },
        context: { requestId, source: AuthorizationSource.Web, occurredAt },
      });
    }
    const { data: companyRow, error: companyError } = await createClient(url, serviceRoleKey, { auth: { persistSession: false } })
      .from("shared_companies").select("tenant_id").eq("organization_id", organization).eq("id", company).maybeSingle();
    if (companyError || !companyRow?.tenant_id) return apiError("COMPANY_NOT_FOUND", "La empresa no existe o no está disponible.", requestId, 404);
    const result = await createPayablesActions().repository.report({
      tenantId: companyRow.tenant_id, organizationId: organization, companyId: company, actorId: identity.userId,
      kind: payload.kind, supplierId: payload.supplierId, documentId: payload.documentId, asOf: payload.asOf, from: payload.from, to: payload.to,
      status: payload.status, filters: pickFilters(payload), limit: payload.limit ?? 50, offset: payload.offset ?? 0,
    });
    return apiSuccess(result, requestId);
  } catch (cause) {
    if (cause instanceof PayablesFailure) {
      const status = cause.code === "FORBIDDEN" ? 403 : cause.code === "NOT_FOUND" ? 404 : cause.code === "VERSION_CONFLICT" || cause.code === "IDEMPOTENCY_CONFLICT" ? 409 : cause.code === "UNAVAILABLE" ? 503 : 400;
      const code = status === 403 ? "PAYABLES_FORBIDDEN" : status === 404 ? "PAYABLES_NOT_FOUND" : status === 503 ? "PAYABLES_UNAVAILABLE" : status === 409 ? "PAYABLES_CONFLICT" : "PAYABLES_INVALID";
      return apiError(code, cause.message, requestId, status);
    }
    if (cause instanceof AuthorizationDenied || cause instanceof DelegatedAccessFailure)
      return apiError("COMPANY_ACCESS_DENIED", "No tienes permiso para consultar estas cuentas por pagar.", requestId, 403);
    console.error("client.payables.query.failed", { requestId, cause });
    return apiError("INTERNAL_ERROR", "No se pudo consultar CxP.", requestId, 500);
  }
}

const REPORT_KINDS: readonly string[] = ["list_pending", "list_settled", "list_voided", "supplier_balance", "aging", "supplier_statement", "payment_history", "payment_batches", "document_detail", "withholdings", "suppliers", "treasury_accounts", "policy", "accounting_reconciliation", "withholding_voucher"];
const FILTERS: readonly PayablesReportFilter[] = ["currency", "documentKind", "branchId", "dueFrom", "dueTo", "overdueMin", "overdueMax", "paymentId", "method", "accountId", "createdBy", "withholdingKind", "fiscalPeriod", "withholdingId"];

function pickFilters(payload: PayablesQueryPayload): Partial<Record<PayablesReportFilter, string>> {
  const filters: Partial<Record<PayablesReportFilter, string>> = {};
  for (const key of FILTERS) { const value = payload[key]; if (typeof value === "string" && value.length > 0) filters[key] = value; }
  return filters;
}

function isPayload(value: unknown): value is PayablesQueryPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.organizationId === "string" && typeof candidate.companyId === "string" &&
    REPORT_KINDS.includes(String(candidate.kind)) &&
    (candidate.kind !== "document_detail" || typeof candidate.documentId === "string" && candidate.documentId.length > 0) &&
    (candidate.kind !== "supplier_statement" || typeof candidate.supplierId === "string" && candidate.supplierId.length > 0) &&
    ["supplierId", "documentId", "asOf", "from", "to", "status", ...FILTERS].every((key) => candidate[key] === undefined || typeof candidate[key] === "string" && candidate[key].length <= 128) &&
    (candidate.limit === undefined || Number.isSafeInteger(candidate.limit) && Number(candidate.limit) > 0 && Number(candidate.limit) <= 200) &&
    (candidate.offset === undefined || Number.isSafeInteger(candidate.offset) && Number(candidate.offset) >= 0);
}
