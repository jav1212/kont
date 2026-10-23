import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { SummarizeProductTaxAssignments } from "@kontave/taxation/application";
import { taxationDate, TaxationFailure } from "@kontave/taxation/domain";
import { SupabaseProductTaxAssignmentSummaryReader } from "@kontave/taxation/supabase";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

/**
 * Counts the company's active products by the IVA assignment effective on a date.
 * @param request - Query with company ID and optional effective date (defaults to today).
 * @param tenant - Authenticated tenant with company-settings read permission.
 * @returns Counts by treatment and category, plus unassigned and legacy-inconsistent products.
 */
export const GET = withTenantPermission("companies.read", async (request, tenant) => {
  const query = new URL(request.url).searchParams;
  const companyValue = query.get("companyId")?.trim() ?? "";
  const onValue = query.get("on")?.trim() || new Date().toISOString().slice(0, 10);
  if (!companyValue || companyValue.length > 256 || !/^\d{4}-\d{2}-\d{2}$/.test(onValue)) return Response.json({ error: "Empresa o fecha inválida." }, { status: 400 });
  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  try {
    const reader = new SupabaseProductTaxAssignmentSummaryReader(new ServerSupabaseSource().instance, tenant.tenantId);
    const data = await new SummarizeProductTaxAssignments(reader).execute({
      actorUserId: userId(tenant.userId),
      organizationId: organizationId(authorization.organizationId),
      companyId: companyId(companyValue),
    }, taxationDate(onValue));
    return Response.json({ data });
  } catch (cause) {
    if (cause instanceof TaxationFailure) {
      if (cause.code === "TAXATION_ACCESS_DENIED") return Response.json({ error: "No tienes acceso a la configuración fiscal de esta empresa.", code: cause.code }, { status: 403 });
      if (cause.code === "TAXATION_DATE_INVALID") return Response.json({ error: "Fecha inválida.", code: cause.code }, { status: 400 });
    }
    console.error("fiscal.iva.product_tax_assignments.read_failed", { companyId: companyValue, cause });
    return Response.json({ error: "No fue posible consultar las alícuotas por producto." }, { status: 503 });
  }
});
