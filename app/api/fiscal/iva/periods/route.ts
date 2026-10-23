import { GetVatFiscalPeriod } from "@kontave/tax-reporting/application";
import { TaxReportingFailure } from "@kontave/tax-reporting/domain";
import { createSupabaseVatFiscalPeriodRepository } from "@kontave/tax-reporting/supabase";
import { PermissionDeniedError, requirePermission, resolveCanonicalTenantAuthorization, withTenant } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { taxReportingFailureResponse } from "../failure-response";

/** Reads one fiscal-period state and reports missing periodicity as a visible pending item.
 * @param request - Company and periodKey query parameters.
 * @param tenant - Authenticated tenant context.
 * @returns Period state, audit events, and blocking profile configuration.
 */
export const GET = withTenant(async (request, tenant) => {
  let canRead = false;
  for (const permission of ["purchases.read", "sales.read"] as const) {
    try { await requirePermission(tenant, permission, { req: request, auditAllow: true }); canRead = true; } catch (error) { if (!(error instanceof PermissionDeniedError)) throw error; }
  }
  if (!canRead) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const companyId = params.get("companyId")?.trim() ?? "";
  const periodKey = params.get("periodKey")?.trim() ?? "";
  if (!companyId || !periodKey || periodKey.length > 16) return Response.json({ error: "Empresa y período son requeridos." }, { status: 400 });
  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  try {
    const periods = createSupabaseVatFiscalPeriodRepository(new ServerSupabaseSource().instance);
    const data = await new GetVatFiscalPeriod(periods).execute({ scope: { tenantId: tenant.tenantId, organizationId: authorization.organizationId, companyId }, periodKey, actorId: tenant.userId });
    return Response.json({ data });
  } catch (cause) {
    if (cause instanceof TaxReportingFailure) return taxReportingFailureResponse(cause);
    return Response.json({ error: "No fue posible consultar el período fiscal." }, { status: 500 });
  }
});
