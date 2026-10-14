import { RecordImportTaxFact } from "@kontave/tax-reporting/application";
import { decodeFact, encode, SupabaseTaxReportingRepository } from "@kontave/tax-reporting/supabase";
import { TaxReportingFailure } from "@kontave/tax-reporting/domain";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { taxReportingFailureResponse } from "../failure-response";

/** Records an accountant-reviewed import snapshot through the shared tax-reporting package.
 * @param request - Company and serialized historical import fact with a stable idempotency header.
 * @param tenant - Authenticated tenant with purchase-confirmation permission.
 * @returns The persisted import fact, replay result, or a typed scope/validation/database failure.
 */
export const POST = withTenantPermission("purchases.confirm", async (request, tenant) => {
  let companyId: string;
  let factValue: unknown;
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  try {
    const body = record(await request.json());
    companyId = requiredText(body.companyId, "companyId", 256);
    factValue = body.fact;
    if (!factValue || typeof factValue !== "object" || Array.isArray(factValue)) throw new Error("fact is required.");
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw new Error("A stable Idempotency-Key header is required.");
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Solicitud de importación inválida." }, { status: 400 });
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
    const submittedFact = decodeFact(factValue);
    // Tenant scope is derived from the authenticated server context; client JSON never selects its owner.
    const fact = {
      ...submittedFact,
      scope: { tenantId: tenant.tenantId, organizationId: authorization.organizationId, companyId },
    };
    const result = await new RecordImportTaxFact(new SupabaseTaxReportingRepository(client)).execute({
      fact,
      actorId: tenant.userId,
      idempotencyKey,
    });
    return Response.json({ data: JSON.parse(encode(result)) }, { status: result.replayed ? 200 : 201 });
  } catch (cause) {
    if (cause instanceof TaxReportingFailure) return taxReportingFailureResponse(cause);
    console.error("fiscal.iva.import.record_failed", { companyId, cause });
    return Response.json({ error: "No fue posible guardar el hecho de importación IVA." }, { status: 500 });
  }
});

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("El cuerpo JSON debe ser un objeto.");
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, name: string, limit: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error(`${name} es requerido.`);
  return value.trim();
}
