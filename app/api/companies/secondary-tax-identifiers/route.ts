import { CompanyFailure } from "@kontave/companies/domain";
import { companyId } from "@kontave/companies/domain";
import { getCompanyAdministrationWebContext } from "@/src/modules/companies/backend/administration-web";
import { withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { z } from "zod";

const companyQuery = z.string().trim().min(1).max(128);
const identifierInput = z.object({
  companyId: companyQuery,
  jurisdiction: z.string().trim().length(2),
  scheme: z.string().trim().min(1).max(64),
  value: z.string().trim().min(1).max(128),
  expectedVersion: z.number().int().nonnegative(),
});
const removeInput = identifierInput.omit({ value: true }).extend({ expectedVersion: z.number().int().positive() });

/**
 * Lists active secondary tax identifiers for an authorized company.
 * @param request - Authenticated request with companyId query parameter.
 * @returns Active identifiers, including their per-slot revisions.
 * @throws Tenant authorization failures are translated by the route wrapper.
 */
export const GET = withTenantPermission("companies.read", async (request, tenant) => {
  const parsedCompanyId = companyQuery.safeParse(new URL(request.url).searchParams.get("companyId"));
  if (!parsedCompanyId.success) return Response.json({ error: "Empresa inválida." }, { status: 400 });
  try {
    const context = await getCompanyAdministrationWebContext(tenant, parsedCompanyId.data);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const scope = { ...context.actions.scope(), companyId: companyId(context.company.id) };
    return Response.json({ data: await context.actions.getSecondaryTaxIdentifiers.execute(scope) });
  } catch (cause) { return companyFailure(cause, "consultar"); }
});

/**
 * Creates or replaces a versioned secondary tax identifier slot.
 * @param request - Authenticated request with company, jurisdiction, scheme, value and expected revision.
 * @returns The authoritative persisted identifier.
 * @throws Tenant authorization failures are translated by the route wrapper.
 */
export const PUT = withTenantPermission("companies.update", async (request, tenant) => {
  const input = identifierInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Identificador tributario inválido." }, { status: 400 });
  try {
    const context = await getCompanyAdministrationWebContext(tenant, input.data.companyId);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const scope = { ...context.actions.scope(), companyId: companyId(context.company.id) };
    const data = await context.actions.setSecondaryTaxIdentifier.execute({ ...scope,
      jurisdiction: input.data.jurisdiction, scheme: input.data.scheme,
      value: input.data.value, expectedVersion: input.data.expectedVersion,
    });
    return Response.json({ data });
  } catch (cause) { return companyFailure(cause, "guardar"); }
});

/**
 * Retires a secondary tax identifier and clears its stored value.
 * @param request - Authenticated request with exact slot and expected revision.
 * @returns Confirmation after the retirement commits.
 * @throws Tenant authorization failures are translated by the route wrapper.
 */
export const DELETE = withTenantPermission("companies.update", async (request, tenant) => {
  const input = removeInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Solicitud de retiro inválida." }, { status: 400 });
  try {
    const context = await getCompanyAdministrationWebContext(tenant, input.data.companyId);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const scope = { ...context.actions.scope(), companyId: companyId(context.company.id) };
    await context.actions.removeSecondaryTaxIdentifier.execute({ ...scope,
      jurisdiction: input.data.jurisdiction, scheme: input.data.scheme,
      expectedVersion: input.data.expectedVersion,
    });
    return Response.json({ data: { removed: true } });
  } catch (cause) { return companyFailure(cause, "retirar"); }
});

function companyFailure(cause: unknown, action: string): Response {
  if (cause instanceof CompanyFailure) return Response.json({ error: cause.message, code: cause.code }, {
    status: cause.code.includes("VERSION_CONFLICT") ? 409 : cause.code === "COMPANY_ACCESS_DENIED" ? 403 : cause.code === "COMPANY_REPOSITORY_UNAVAILABLE" ? 503 : 422,
  });
  console.error("companies.secondary_tax_identifier.failed", { action, cause });
  return Response.json({ error: `No fue posible ${action} el identificador tributario.` }, { status: 500 });
}
