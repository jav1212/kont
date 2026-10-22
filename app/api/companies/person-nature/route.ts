import { CompanyFailure, companyId, companyPersonNature } from "@kontave/companies/domain";
import { getCompanyAdministrationWebContext } from "@/src/modules/companies/backend/administration-web";
import { withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { z } from "zod";

const companyQuery = z.string().trim().min(1).max(128);
const updateInput = z.object({ companyId: companyQuery, personNature: z.enum(["natural", "juridical"]) });

/**
 * Reads verified person nature and company revision for the selected company.
 * @param request - Authenticated request with companyId query parameter.
 * @returns Current classification, possibly null for unreviewed historical companies.
 * @throws Tenant authorization failures are translated by the route wrapper.
 */
export const GET = withTenantPermission("companies.read", async (request, tenant) => {
  const parsedCompanyId = companyQuery.safeParse(new URL(request.url).searchParams.get("companyId"));
  if (!parsedCompanyId.success) return Response.json({ error: "Empresa inválida." }, { status: 400 });
  try {
    const context = await getCompanyAdministrationWebContext(tenant, parsedCompanyId.data);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    return Response.json({ data: {
      companyId: context.company.id,
      personNature: context.company.person_nature === null ? null : companyPersonNature(context.company.person_nature),
      version: context.company.version,
    } });
  } catch (cause) { return companyFailure(cause); }
});

/**
 * Sets the selected company's verified civil-law nature using its current revision.
 * @param request - Authenticated request with companyId and an explicit natural/juridical selection.
 * @returns The authoritative person nature and updated company revision.
 * @throws Tenant authorization failures are translated by the route wrapper.
 */
export const PATCH = withTenantPermission("companies.update", async (request, tenant) => {
  const input = updateInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Clasificación de persona inválida." }, { status: 400 });
  try {
    const context = await getCompanyAdministrationWebContext(tenant, input.data.companyId);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const company = await context.actions.setPersonNature.execute({
      ...context.actions.scope(), companyId: companyId(context.company.id),
      expectedVersion: context.company.version, personNature: companyPersonNature(input.data.personNature),
    });
    return Response.json({ data: { companyId: company.id, personNature: company.personNature, version: company.version } });
  } catch (cause) { return companyFailure(cause); }
});

function companyFailure(cause: unknown): Response {
  if (cause instanceof CompanyFailure) return Response.json({ error: cause.message, code: cause.code }, {
    status: cause.code.includes("VERSION_CONFLICT") ? 409 : cause.code === "COMPANY_ACCESS_DENIED" ? 403 : cause.code === "COMPANY_REPOSITORY_UNAVAILABLE" ? 503 : 422,
  });
  console.error("companies.person_nature.failed", { cause });
  return Response.json({ error: "No fue posible leer o actualizar la clasificación de persona." }, { status: 500 });
}
