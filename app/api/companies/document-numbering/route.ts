import { CompanyFailure, companyId } from "@kontave/companies/domain";
import { getCompanyAdministrationWebContext } from "@/src/modules/companies/backend/administration-web";
import { withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { z } from "zod";

const companyIdSchema = z.string().trim().min(1).max(128);
const counterSchema = z.number().int().min(1).max(99_999_999);
const updateSchema = z.object({
  companyId: companyIdSchema,
  expectedVersion: z.number().int().nonnegative(),
  salesInvoiceNextNumber: counterSchema.optional(),
  deliveryNoteNextNumber: counterSchema.optional(),
}).refine((input) => input.salesInvoiceNextNumber !== undefined || input.deliveryNoteNextNumber !== undefined);

/**
 * Reads the next invoice and delivery-note counters for one company.
 * @param request - Authenticated request with companyId in its query string.
 * @returns Current counters and company revision.
 * @throws Tenant authorization and persistence failures are translated to HTTP responses.
 */
export const GET = withTenantPermission("companies.update", async (request, tenant) => {
  const parsedCompanyId = companyIdSchema.safeParse(new URL(request.url).searchParams.get("companyId"));
  if (!parsedCompanyId.success) return Response.json({ error: "Empresa inválida." }, { status: 400 });
  try {
    const context = await getCompanyAdministrationWebContext(tenant, parsedCompanyId.data);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const data = await context.actions.getDocumentNumbering.execute({
      ...context.actions.scope(), companyId: companyId(context.company.id), expectedVersion: context.company.version,
    });
    return Response.json({ data });
  } catch (cause) { return companyFailure(cause); }
});

/**
 * Advances one or both existing commercial counters without allowing reuse or rewind.
 * @param request - Authenticated request with expectedVersion and selected next counter values.
 * @returns The authoritative counters and incremented company revision.
 * @throws Tenant authorization, validation and concurrency failures are translated to HTTP responses.
 */
export const PATCH = withTenantPermission("companies.update", async (request, tenant) => {
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Indica una empresa, una revisión y al menos un correlativo válido." }, { status: 400 });
  try {
    const context = await getCompanyAdministrationWebContext(tenant, input.data.companyId);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const data = await context.actions.updateDocumentNumbering.execute({
      ...context.actions.scope(), companyId: companyId(context.company.id), expectedVersion: input.data.expectedVersion,
      ...(input.data.salesInvoiceNextNumber === undefined ? {} : { salesInvoiceNextNumber: input.data.salesInvoiceNextNumber }),
      ...(input.data.deliveryNoteNextNumber === undefined ? {} : { deliveryNoteNextNumber: input.data.deliveryNoteNextNumber }),
    });
    return Response.json({ data });
  } catch (cause) { return companyFailure(cause); }
});

function companyFailure(cause: unknown): Response {
  if (cause instanceof CompanyFailure) return Response.json({ error: cause.message, code: cause.code }, {
    status: cause.code === "COMPANY_VERSION_CONFLICT" || cause.code === "COMPANY_DOCUMENT_NUMBER_REWIND" || cause.code === "COMPANY_DOCUMENT_NUMBER_IN_USE" ? 409
      : cause.code === "COMPANY_ACCESS_DENIED" ? 403
      : cause.code === "COMPANY_NOT_FOUND" ? 404
      : cause.code === "COMPANY_REPOSITORY_UNAVAILABLE" ? 503 : 422,
  });
  console.error("companies.document_numbering.failed", { cause });
  return Response.json({ error: "No fue posible consultar o actualizar los correlativos." }, { status: 500 });
}
