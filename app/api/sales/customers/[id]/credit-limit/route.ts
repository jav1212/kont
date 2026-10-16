import { z } from "zod";
import { SalesFailure } from "@kontave/sales/domain";
import { getSalesActions } from "@/src/modules/sales/backend/infra/sales-factory";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";

const writeSchema = z.object({ companyId: z.string().min(1).max(128), limitVes: z.string().regex(/^(0|[1-9]\d{0,19})(\.\d{1,8})?$/), expectedVersion: z.number().int().nonnegative() }).strict();

/** Reads the configured VES credit ceiling for one customer. */
export const GET = withTenantPermission("sales.read", async (request, tenant) => {
  try {
    const companyId = new URL(request.url).searchParams.get("companyId");
    const customerId = (await Promise.resolve(new URL(request.url).pathname.split("/").at(-2))) ?? "";
    if (!companyId || !customerId) return Response.json({ error: "Cliente y empresa son requeridos." }, { status: 400 });
    const authorization = await resolveCanonicalTenantAuthorization(tenant);
    if (!authorization) return Response.json({ error: "Sin acceso a la organización." }, { status: 403 });
    return Response.json({ data: await getSalesActions(tenant.tenantId).securedSales.getCreditLimit({ actorUserId: tenant.userId, organizationId: authorization.organizationId, companyId, customerId }) });
  } catch (error) { return salesFailure(error); }
});

/** Sets a compare-and-swap VES credit ceiling for one customer. */
export const PUT = withTenantPermission("sales.update", async (request, tenant) => {
  try {
    const customerId = new URL(request.url).pathname.split("/").at(-2) ?? "";
    const body = writeSchema.parse(await request.json());
    const authorization = await resolveCanonicalTenantAuthorization(tenant);
    if (!authorization || !customerId) return Response.json({ error: "Sin acceso a la organización." }, { status: 403 });
    return Response.json({ data: await getSalesActions(tenant.tenantId).securedSales.setCreditLimit({ actorUserId: tenant.userId, organizationId: authorization.organizationId, companyId: body.companyId, customerId, limitVes: body.limitVes, expectedVersion: body.expectedVersion }) });
  } catch (error) { return salesFailure(error); }
});

function salesFailure(error: unknown): Response {
  if (error instanceof z.ZodError) return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
  if (error instanceof SalesFailure) return Response.json({ error: error.message, code: error.code }, { status: error.code === "SALES_NOT_FOUND" ? 404 : error.code === "SALES_ACCESS_DENIED" ? 403 : error.code === "SALES_REPOSITORY_UNAVAILABLE" ? 503 : 409 });
  return Response.json({ error: "No se pudo consultar el límite de crédito." }, { status: 500 });
}
