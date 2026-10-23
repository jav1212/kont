import { ConfigureVatPeriodicity, GetVatPeriodicity } from "@kontave/tax-reporting/application";
import { TaxReportingFailure } from "@kontave/tax-reporting/domain";
import { createSupabaseVatPeriodicityRepository } from "@kontave/tax-reporting/supabase";
import { resolveCanonicalTenantAuthorization, withTenantPermission, type TenantContext } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { z } from "zod";
import { taxReportingFailureResponse } from "../failure-response";

const periodicity = z.enum(["monthly", "fortnightly"]);
const saveSchema = z.object({
  companyId: z.string().trim().min(1).max(256),
  periodicity,
  expectedPeriodicity: periodicity.nullable(),
  reason: z.string().trim().max(500).nullable(),
});

/** Spanish operator messages for expected periodicity failures; domain messages stay diagnostic. */
const MESSAGES: Partial<Record<TaxReportingFailure["code"], string>> = {
  TAX_REPORTING_PERIODICITY_LOCKED: "La periodicidad no puede cambiarse porque ya existen períodos fiscales registrados con la actual.",
  TAX_REPORTING_CONCURRENCY_CONFLICT: "La periodicidad cambió mientras editabas. Recarga antes de guardar.",
  TAX_REPORTING_IDEMPOTENCY_CONFLICT: "Esta solicitud ya se usó con otros datos. Recarga e intenta de nuevo.",
  TAX_REPORTING_SCOPE: "No tienes acceso a la configuración fiscal de esta empresa.",
};

/**
 * Reads the selected company's VAT periodicity and its audit trail.
 * @param request - Query with the company ID.
 * @param tenant - Authenticated tenant with company-settings read permission.
 * @returns Periodicity (null when never configured), persisted-period count, and recent changes.
 */
export const GET = withTenantPermission("companies.read", async (request, tenant) => {
  const companyValue = new URL(request.url).searchParams.get("companyId")?.trim() ?? "";
  if (!companyValue || companyValue.length > 256) return Response.json({ error: "Empresa inválida." }, { status: 400 });
  const scope = await resolveScope(tenant, companyValue);
  if (scope instanceof Response) return scope;
  try {
    const data = await new GetVatPeriodicity(createSupabaseVatPeriodicityRepository(new ServerSupabaseSource().instance)).execute({ scope, actorId: tenant.userId });
    return Response.json({ data });
  } catch (cause) {
    return failure(cause, "fiscal.iva.periodicity.read_failed", companyValue);
  }
});

/**
 * Configures or changes the company's VAT periodicity with compare-and-swap and idempotency.
 * @param request - Company, target and expected periodicity, reason, and Idempotency-Key header.
 * @param tenant - Authenticated tenant with company-settings write permission.
 * @returns The saved periodicity, or a typed validation, lock, or concurrency error.
 */
export const PUT = withTenantPermission("companies.update", async (request, tenant) => {
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!parsed.success || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) return Response.json({ error: "Periodicidad o Idempotency-Key inválido." }, { status: 400 });
  const scope = await resolveScope(tenant, parsed.data.companyId);
  if (scope instanceof Response) return scope;
  try {
    const data = await new ConfigureVatPeriodicity(createSupabaseVatPeriodicityRepository(new ServerSupabaseSource().instance)).execute({
      scope,
      command: { periodicity: parsed.data.periodicity, expectedPeriodicity: parsed.data.expectedPeriodicity, reason: parsed.data.reason, actorId: tenant.userId, idempotencyKey },
    });
    return Response.json({ data });
  } catch (cause) {
    return failure(cause, "fiscal.iva.periodicity.write_failed", parsed.data.companyId);
  }
});

async function resolveScope(tenant: TenantContext, companyValue: string): Promise<{ tenantId: string; organizationId: string; companyId: string } | Response> {
  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  return { tenantId: tenant.tenantId, organizationId: authorization.organizationId, companyId: companyValue };
}

function failure(cause: unknown, event: string, companyValue: string): Response {
  if (cause instanceof TaxReportingFailure) {
    const response = taxReportingFailureResponse(cause);
    const message = MESSAGES[cause.code] ?? (cause.code === "TAX_REPORTING_INVALID" ? "La solicitud de periodicidad no es válida." : null);
    return message === null ? response : Response.json({ error: message, code: cause.code }, { status: response.status });
  }
  console.error(event, { companyId: companyValue, cause });
  return Response.json({ error: "No fue posible procesar la periodicidad IVA." }, { status: 500 });
}
