import { createSupabaseVatLedger, encode } from "@kontave/tax-reporting/supabase";
import { TaxReportingFailure } from "@kontave/tax-reporting/domain";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { taxReportingFailureResponse } from "../failure-response";

/** Reads a page of source-traceable purchase VAT facts for the authorized company.
 * @param request - Company, date range, cursor, and bounded page size.
 * @param tenant - Authenticated tenant with purchase read permission.
 * @returns Historical facts and rate/withholding groups; current tax rules are not applied.
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
  const rawCursor = params.get("cursor");
  const cursor = parseCursor(rawCursor);
  if (!companyId || companyId.length > 256 || (params.has("period") && periodRange === null) || !isDate(from) || !isDate(to) || from > to
    || !Number.isInteger(limit) || limit < 1 || limit > 100 || (rawCursor !== null && cursor === undefined)) {
    return Response.json({ error: "Rango, empresa, cursor o límite del libro inválido." }, { status: 400 });
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
    const ledger = await createSupabaseVatLedger(client).execute(
      { tenantId: tenant.tenantId, organizationId: authorization.organizationId, companyId },
      { from, to, ...(period ? { period } : {}), limit, cursor: cursor ?? null },
      tenant.userId,
    );
    return Response.json({ data: JSON.parse(encode(ledger)) });
  } catch (cause) {
    if (cause instanceof TaxReportingFailure) return taxReportingFailureResponse(cause);
    console.error("fiscal.iva.purchase_ledger.read_failed", { companyId, from, to, cause });
    return Response.json({ error: "No fue posible consultar el libro fiscal de compras." }, { status: 500 });
  }
});

function monthRange(period: string): { readonly from: string; readonly to: string } {
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${period}-01`, to: `${period}-${String(lastDay).padStart(2, "0")}` };
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseCursor(value: string | null): { readonly recognitionDate: string; readonly id: string } | null | undefined {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const cursor = parsed as Record<string, unknown>;
    if (typeof cursor.recognitionDate !== "string" || !isDate(cursor.recognitionDate)
      || typeof cursor.id !== "string" || !cursor.id.trim() || cursor.id.length > 256) return undefined;
    return { recognitionDate: cursor.recognitionDate, id: cursor.id };
  } catch {
    return undefined;
  }
}
