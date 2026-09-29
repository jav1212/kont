import { z } from "zod";
import { SalesFailure } from "@kontave/sales/domain";
import { getSalesActions } from "@/src/modules/sales/backend/infra/sales-factory";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";

const schema = z.object({ companyId: z.string().min(1).max(128), idempotencyKey: z.string().min(8).max(128), reason: z.string().min(1).max(500), branchId: z.string().min(1).max(128).nullable().optional(), deviceId: z.string().min(1).max(128).nullable().optional() }).strict();

/** Appends an immutable reversal for one recorded customer payment. */
export const POST = withTenantPermission("sales.receivable_payments.reverse", async (request, tenant) => {
  try {
    const segments = new URL(request.url).pathname.split("/");
    const paymentId = segments.at(-2) ?? "";
    const receivableId = segments.at(-4) ?? "";
    const body = schema.parse(await request.json());
    const authorization = await resolveCanonicalTenantAuthorization(tenant);
    if (!authorization || !paymentId || !receivableId) return Response.json({ error: "Sin acceso a la organización." }, { status: 403 });
    return Response.json({ data: await getSalesActions(tenant.tenantId).securedSales.reversePayment({ actorUserId: tenant.userId, organizationId: authorization.organizationId, companyId: body.companyId, receivableId, paymentId, idempotencyKey: body.idempotencyKey, reason: body.reason, branchId: body.branchId, deviceId: tenant.barcodeTerminalId ?? body.deviceId ?? null }) });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
    if (error instanceof SalesFailure) return Response.json({ error: error.message, code: error.code }, { status: error.code === "SALES_NOT_FOUND" ? 404 : error.code === "SALES_ACCESS_DENIED" ? 403 : error.code === "SALES_REPOSITORY_UNAVAILABLE" ? 503 : 409 });
    return Response.json({ error: "No se pudo revertir el pago." }, { status: 500 });
  }
});
