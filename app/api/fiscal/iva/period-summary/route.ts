import { createSupabaseVatPeriodSummary, encode } from "@kontave/tax-reporting/supabase";
import { TaxReportingFailure } from "@kontave/tax-reporting/domain";
import { requirePermission, PermissionDeniedError, withTenant, resolveCanonicalTenantAuthorization } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { taxReportingFailureResponse } from "../failure-response";

/** Reads only the period-summary sections allowed by the actor's fiscal permissions.
 * @param request - Company and YYYY-MM period query.
 * @param tenant - Authenticated tenant context.
 * @returns Exact, dimension-preserving VAT totals.
 */
export const GET = withTenant(async (request, tenant) => {
  const params = new URL(request.url).searchParams;
  const companyId = params.get("companyId")?.trim() ?? "";
  const period = params.get("period")?.trim() ?? "";
  if (!companyId || companyId.length > 256 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return Response.json({ error: "Empresa y período YYYY-MM válidos son requeridos." }, { status: 400 });
  let includePurchases = false;
  let includeSales = false;
  try { await requirePermission(tenant, "purchases.read", { req: request, auditAllow: true }); includePurchases = true; } catch (cause) { if (!(cause instanceof PermissionDeniedError)) throw cause; }
  try { await requirePermission(tenant, "sales.read", { req: request, auditAllow: true }); includeSales = true; } catch (cause) { if (!(cause instanceof PermissionDeniedError)) throw cause; }
  if (!includePurchases && !includeSales) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  const client = new ServerSupabaseSource().instance;
  const { data: company, error: companyError } = await client.from("shared_companies").select("id")
    .eq("tenant_id", tenant.tenantId).eq("organization_id", authorization.organizationId).eq("id", companyId).maybeSingle();
  if (companyError) return Response.json({ error: "No fue posible validar la empresa." }, { status: 503 });
  if (!company) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
  try {
    const summary = await createSupabaseVatPeriodSummary(client).execute({
      scope: { tenantId: tenant.tenantId, organizationId: authorization.organizationId, companyId },
      actorId: tenant.userId, period, includePurchases, includeSales,
    });
    return Response.json({ data: JSON.parse(encode(summary)) });
  } catch (cause) {
    if (cause instanceof TaxReportingFailure) return taxReportingFailureResponse(cause);
    console.error("fiscal.iva.period_summary.read_failed", { companyId, period, cause });
    return Response.json({ error: "No fue posible consultar el resumen del período." }, { status: 500 });
  }
});

