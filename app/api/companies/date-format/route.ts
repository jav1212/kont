import { CompanyFailure, companyId, type CompanyDateOrder } from "@kontave/companies/domain";
import { getCompanyAdministrationWebContext } from "@/src/modules/companies/backend/administration-web";
import { withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { z } from "zod";

const companyIdSchema = z.string().trim().min(1).max(128);
const dateOrderSchema = z.enum(["day_first", "year_first", "month_first"]);
const updateSchema = z.object({
  companyId: companyIdSchema,
  expectedFormatVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(1).max(500),
  dateOrder: dateOrderSchema,
});

/**
 * Reads the current company date-format preference without creating a default row.
 * @param request - Authenticated request with companyId in its query string.
 * @returns The configured revision or null when the company has no explicit choice.
 * @throws Tenant authorization and persistence failures are translated to HTTP responses.
 */
export const GET = withTenantPermission("companies.read", async (request, tenant) => {
  const parsedCompanyId = companyIdSchema.safeParse(new URL(request.url).searchParams.get("companyId"));
  if (!parsedCompanyId.success) return Response.json({ error: "Empresa inválida." }, { status: 400 });
  try {
    const context = await getCompanyAdministrationWebContext(tenant, parsedCompanyId.data);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const data = await context.actions.getDateFormat.execute({
      ...context.actions.scope(), companyId: companyId(context.company.id),
    });
    return Response.json({ data: data ? { dateOrder: data.dateOrder, version: data.version, configuredAt: data.configuredAt } : null });
  } catch (cause) { return companyFailure(cause); }
});

/**
 * Appends a company-owned date display preference with revision and idempotency protection.
 * @param request - Authenticated JSON request with format, expected revision, reason, and replay key.
 * @returns The immutable configured date-format revision.
 * @throws Tenant authorization, validation and concurrency failures are translated to HTTP responses.
 */
export const PATCH = withTenantPermission("companies.update", async (request, tenant) => {
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "La configuración del formato de fecha no es válida." }, { status: 400 });
  try {
    const context = await getCompanyAdministrationWebContext(tenant, input.data.companyId);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const data = await context.actions.configureDateFormat.execute({
      ...context.actions.scope(), companyId: companyId(context.company.id),
      expectedFormatVersion: input.data.expectedFormatVersion,
      idempotencyKey: input.data.idempotencyKey,
      reason: input.data.reason,
      dateOrder: input.data.dateOrder as CompanyDateOrder,
    });
    return Response.json({ data: { dateOrder: data.dateOrder, version: data.version, configuredAt: data.configuredAt } });
  } catch (cause) { return companyFailure(cause); }
});

function companyFailure(cause: unknown): Response {
  if (cause instanceof CompanyFailure) return Response.json({ error: cause.message, code: cause.code }, {
    status: cause.code === "COMPANY_DATE_FORMAT_VERSION_CONFLICT" || cause.code === "COMPANY_DATE_FORMAT_IDEMPOTENCY_CONFLICT" ? 409
      : cause.code === "COMPANY_ACCESS_DENIED" ? 403
      : cause.code === "COMPANY_NOT_FOUND" ? 404
      : cause.code === "COMPANY_REPOSITORY_UNAVAILABLE" ? 503 : 422,
  });
  console.error("companies.date_format.failed", { cause });
  return Response.json({ error: "No fue posible consultar o guardar el formato de fecha." }, { status: 500 });
}
