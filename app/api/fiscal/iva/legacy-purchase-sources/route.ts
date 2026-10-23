import { SupabaseTaxReportingRepository } from "@kontave/tax-reporting/supabase";
import { TaxReportingFailure } from "@kontave/tax-reporting/domain";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { taxReportingFailureResponse } from "../failure-response";
import { recordLegacyVatSource } from "../record-legacy-source";

/**
 * Reads historical purchase documents for an authorized, read-only IVA review.
 * Returned source rows are not classified, persisted as facts, or included in a declaration.
 * @param request - Company, date bounds, cursor, and bounded page size.
 * @param tenant - Authenticated tenant with purchasing read access.
 * @returns One source page for an accountant or reviewer.
 * @throws Infrastructure failures from the shared authorization boundary may propagate.
 */
export const GET = withTenantPermission("purchases.read", async (request, tenant) => {
  const params = new URL(request.url).searchParams;
  const companyId = params.get("companyId")?.trim() ?? "";
  const period = params.get("period")?.trim() ?? "";
  const periodRange = /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? monthRange(period) : null;
  const from = periodRange?.from ?? params.get("from")?.trim() ?? "";
  const to = periodRange?.to ?? params.get("to")?.trim() ?? "";
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 100 : Number(rawLimit);
  const cursor = params.get("cursor");
  if (!companyId || companyId.length > 256 || (params.has("period") && periodRange === null) || !isDate(from) || !isDate(to) || from > to
    || !Number.isInteger(limit) || limit < 1 || limit > 100 || !isCursor(cursor)) {
    return Response.json({ error: "Rango, empresa, cursor o límite de revisión inválido." }, { status: 400 });
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
    const repository = new SupabaseTaxReportingRepository(client);
    const page = await repository.readLegacyVatSources({
      scope: { tenantId: tenant.tenantId, organizationId: authorization.organizationId, companyId },
      actorId: tenant.userId,
      direction: "purchase",
      from,
      to,
      ...(periodRange ? { period } : {}),
      cursor,
      limit,
    });
    return Response.json({ data: page });
  } catch (cause) {
    if (cause instanceof TaxReportingFailure) {
      return taxReportingFailureResponse(cause);
    }
    console.error("fiscal.iva.legacy_purchase_sources.read_failed", { companyId, from, to, cause });
    return Response.json({ error: "No fue posible leer las fuentes históricas de compras." }, { status: 500 });
  }
});

/** Records explicit review evidence for one legacy purchase IVA source.
 * @param request - Source identity, exact amounts, reviewed rates and idempotency header.
 * @param tenant - Authenticated reviewer authorized to confirm purchase records.
 * @returns The appended immutable fact or a typed HTTP failure.
 */
export const POST = withTenantPermission("purchases.confirm", async (request, tenant) => recordLegacyVatSource(request, tenant, "purchase"));

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function monthRange(period: string): { readonly from: string; readonly to: string } {
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${period}-01`, to: `${period}-${String(lastDay).padStart(2, "0")}` };
}

function isCursor(value: string | null): value is string | null {
  if (value === null) return true;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const cursor = parsed as Record<string, unknown>;
    return typeof cursor.date === "string" && isDate(cursor.date)
      && typeof cursor.id === "string" && cursor.id.trim().length > 0 && cursor.id.length <= 256;
  } catch {
    return false;
  }
}
