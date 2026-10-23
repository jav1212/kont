import { ChangeVatFiscalPeriod } from "@kontave/tax-reporting/application";
import { TaxReportingFailure, type VatFiscalPeriodStatus } from "@kontave/tax-reporting/domain";
import { createSupabaseVatFiscalPeriodRepository } from "@kontave/tax-reporting/supabase";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { withTenantPermissions, resolveCanonicalTenantAuthorization } from "@/src/shared/backend/utils/require-tenant";
import { taxReportingFailureResponse } from "../../../failure-response";

/** Records an audited, idempotent fiscal-period lifecycle transition.
 * @param request - Transition body and stable Idempotency-Key.
 * @param tenant - Authenticated tenant context.
 * @returns Saved fiscal-period status or a typed validation/conflict response.
 */
export const POST = withTenantPermissions(["purchases.read", "sales.read", "purchases.confirm", "sales.update"], async (request, tenant) => {
  try {
    const pathParts = new URL(request.url).pathname.split("/").filter(Boolean);
    const periodKey = decodeURIComponent(pathParts.at(-2) ?? "");
    const key = request.headers.get("Idempotency-Key")?.trim() ?? "";
    if (!periodKey || periodKey.length > 16 || !key || key.length > 128) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Período o clave idempotente no válidos.");
    const body: unknown = await request.json();
    if (!isRecord(body)) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "El comando de período no es válido.");
    const companyId = requiredText(body.companyId, "companyId");
    const target = requiredText(body.to, "to") as VatFiscalPeriodStatus;
    const expectedVersion = Number(body.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "La versión esperada no es válida.");
    const authorization = await resolveCanonicalTenantAuthorization(tenant);
    if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
    const periods = createSupabaseVatFiscalPeriodRepository(new ServerSupabaseSource().instance);
    const result = await new ChangeVatFiscalPeriod(periods).execute({
      scope: { tenantId: tenant.tenantId, organizationId: authorization.organizationId, companyId }, periodKey,
      transition: { to: target, actorId: tenant.userId, occurredAt: new Date().toISOString(), idempotencyKey: key, expectedVersion,
        ...(typeof body.reason === "string" ? { reason: body.reason } : {}), ...(typeof body.declarationId === "string" ? { declarationId: body.declarationId } : {}) },
    });
    return Response.json({ data: result });
  } catch (cause) {
    if (cause instanceof TaxReportingFailure) return taxReportingFailureResponse(cause);
    return Response.json({ error: "No fue posible actualizar el período fiscal." }, { status: 500 });
  }
});

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function requiredText(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) throw new TaxReportingFailure("TAX_REPORTING_INVALID", `${name} es requerido.`); return value.trim(); }
