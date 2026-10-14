import { ListVatDeclarationHistory } from "@kontave/tax-reporting/application";
import { TaxReportingFailure } from "@kontave/tax-reporting/domain";
import { encode, SupabaseTaxReportingRepository } from "@kontave/tax-reporting/supabase";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { resolveCanonicalTenantAuthorization, withTenantPermissions } from "@/src/shared/backend/utils/require-tenant";
import { taxReportingFailureResponse } from "../failure-response";

/** Lists internal IVA declaration revisions after both books authorize the reader.
 * @param request - Company, inclusive period bounds, page size, and optional stable cursor.
 * @param tenant - Authenticated member with purchase and sales read permissions.
 * @returns One page of immutable internal declaration snapshots.
 */
export const GET = withTenantPermissions(["purchases.read", "sales.read"], async (request, tenant) => {
  const params = new URL(request.url).searchParams;
  const companyId = params.get("companyId")?.trim() ?? "";
  const fromPeriod = params.get("fromPeriod")?.trim() ?? "";
  const toPeriod = params.get("toPeriod")?.trim() ?? "";
  const parsedLimit = Number(params.get("limit") ?? "50");
  let cursor: { period: string; id: string; revision: number } | null = null;
  try {
    const cursorValue = params.get("cursor");
    if (cursorValue) {
      const candidate: unknown = JSON.parse(cursorValue);
      if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) throw new Error("Invalid declaration cursor.");
      const value = candidate as Record<string, unknown>;
      if (typeof value.period !== "string" || typeof value.id !== "string" || typeof value.revision !== "number") throw new Error("Invalid declaration cursor.");
      cursor = { period: value.period, id: value.id, revision: value.revision };
    }
    if (!companyId || companyId.length > 256 || !Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) throw new Error("Invalid declaration history query.");
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Invalid declaration history query." }, { status: 400 });
  }

  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  const client = new ServerSupabaseSource().instance;
  const { data: company, error: companyError } = await client.from("shared_companies")
    .select("id")
    .eq("tenant_id", tenant.tenantId)
    .eq("organization_id", authorization.organizationId)
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) return Response.json({ error: "No fue posible validar la empresa." }, { status: 503 });
  if (!company) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });

  try {
    const action = new ListVatDeclarationHistory(new SupabaseTaxReportingRepository(client));
    const result = await action.execute(
      { tenantId: tenant.tenantId, organizationId: authorization.organizationId, companyId },
      { fromPeriod, toPeriod, limit: parsedLimit, cursor },
      tenant.userId,
    );
    return Response.json({ data: JSON.parse(encode(result)) });
  } catch (cause) {
    if (cause instanceof TaxReportingFailure) return taxReportingFailureResponse(cause);
    console.error("fiscal.iva.declaration.history_failed", { companyId, cause });
    return Response.json({ error: "No fue posible consultar el historial interno de IVA." }, { status: 500 });
  }
});
