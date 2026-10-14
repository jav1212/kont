import { companyId, companyDocumentType, CompanyFailure, type CompanyDocumentType } from "@kontave/companies/domain";
import { withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { getCompanyAdministrationWebContext } from "@/src/modules/companies/backend/administration-web";
import { z } from "zod";

const documentTypeSchema = z.enum([
  "sales_invoice", "sales_delivery_note", "sales_credit_note", "sales_debit_note",
  "purchase_invoice", "purchase_credit_note", "purchase_debit_note",
]);
const bodySchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("create"), companyId: z.string().trim().min(1).max(128),
    documentType: documentTypeSchema, code: z.string().min(1).max(32), prefix: z.string().max(32).nullable(),
    nextNumber: z.number().int().min(1).max(99_999_999), maximumNumber: z.number().int().min(1).max(99_999_999),
  }).strict(),
  z.object({
    operation: z.literal("configure-selection"), companyId: z.string().trim().min(1).max(128),
    documentType: documentTypeSchema, expectedVersion: z.number().int().nonnegative(),
    policy: z.enum(["company_default", "branch_default", "explicit_series_required"]),
    defaultSeriesId: z.string().uuid().nullable(),
  }).strict(),
]);

/** Lists sales invoice numbering series for a company authorized to the actor.
 * @param request - Company identifier in the query string.
 * @param tenant - Authenticated actor with company read permission.
 * @returns Series definitions and the active selection policy.
 */
export const GET = withTenantPermission("companies.read", async (request, tenant) => {
  const company = new URL(request.url).searchParams.get("companyId")?.trim() ?? "";
  if (!company || company.length > 128) return Response.json({ error: "Empresa inválida." }, { status: 400 });
  try {
    const context = await getCompanyAdministrationWebContext(tenant, company);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const actor = context.actions.scope();
    const scope = { kind: "company" as const, organizationId: actor.organizationId, companyId: companyId(context.company.id) };
    const data = await context.actions.documentSeries.list.execute({ ...actor, companyId: scope.companyId, scope, documentType: "sales_invoice" });
    return Response.json({ data });
  } catch (cause) { return failure(cause); }
});

/** Creates a company invoice series or updates its versioned selection policy.
 * @param request - Explicit idempotent series operation.
 * @param tenant - Authenticated actor with company update permission.
 * @returns The persisted series or policy revision.
 */
export const POST = withTenantPermission("companies.update", async (request, tenant) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "La configuración de serie no es válida." }, { status: 400 });
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) return Response.json({ error: "Se requiere una clave de idempotencia válida." }, { status: 400 });
  try {
    const context = await getCompanyAdministrationWebContext(tenant, parsed.data.companyId);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const actor = context.actions.scope();
    const company = companyId(context.company.id);
    const scope = { kind: "company" as const, organizationId: actor.organizationId, companyId: company };
    const documentType: CompanyDocumentType = companyDocumentType(parsed.data.documentType);
    if (parsed.data.operation === "create") {
      const data = await context.actions.documentSeries.create.execute({
        ...actor, companyId: company, idempotencyKey, scope, documentType,
        code: parsed.data.code, prefix: parsed.data.prefix, nextNumber: parsed.data.nextNumber,
        maximumNumber: parsed.data.maximumNumber,
      });
      return Response.json({ data }, { status: 201 });
    }
    const data = await context.actions.documentSeries.configureSelectionRule.execute({
      ...actor, companyId: company, idempotencyKey, scope, documentType,
      expectedVersion: parsed.data.expectedVersion, policy: parsed.data.policy, defaultSeriesId: parsed.data.defaultSeriesId,
    });
    return Response.json({ data });
  } catch (cause) { return failure(cause); }
});

function failure(cause: unknown): Response {
  if (cause instanceof CompanyFailure) return Response.json({ error: cause.message, code: cause.code }, {
    status: cause.code === "COMPANY_ACCESS_DENIED" ? 403
      : cause.code === "COMPANY_NOT_FOUND" ? 404
        : cause.code.includes("CONFLICT") || cause.code.includes("IDEMPOTENCY") ? 409
          : cause.code === "COMPANY_REPOSITORY_UNAVAILABLE" ? 503 : 422,
  });
  console.error("companies.document_series.failed", { cause });
  return Response.json({ error: "No fue posible procesar la configuración de series." }, { status: 500 });
}
