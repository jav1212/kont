import { createSupabaseVatRetentionExportActions } from "@kontave/tax-reporting/supabase";
import { TaxReportingFailure } from "@kontave/tax-reporting/domain";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { taxReportingFailureResponse } from "@/app/api/fiscal/iva/failure-response";

/**
 * Reads the monthly VAT withholding export through the shared tax-reporting package.
 * @param request - HTTP request with the requested company and month.
 * @param tenant - Authenticated tenant scope authorized for purchases.read.
 * @returns The envelope consumed by the browser TXT renderer.
 */
export const GET = withTenantPermission("purchases.read", async (request, { tenantId }) => {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId")?.trim() ?? "";
  const period = searchParams.get("period")?.trim() ?? "";
  if (!companyId) return Response.json({ error: "companyId es requerido" }, { status: 400 });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return Response.json({ error: "period debe tener formato YYYY-MM válido" }, { status: 400 });
  }

  try {
    const actions = createSupabaseVatRetentionExportActions(new ServerSupabaseSource().instance);
    const data = await actions.getVatRetentionExport.execute({ tenantId, companyId, period });
    return Response.json({ data });
  } catch (cause) {
    if (cause instanceof TaxReportingFailure) {
      return taxReportingFailureResponse(cause);
    }
    console.error("purchases.iva_retention_export.failed", { companyId, period, cause });
    return Response.json({ error: "No fue posible consultar la exportación de retenciones IVA." }, { status: 500 });
  }
});
