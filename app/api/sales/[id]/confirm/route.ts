import { z } from "zod";
import { permissionCode } from "@kontave/access-control/domain";
import { SalesFailure } from "@kontave/sales/domain";
import { getSalesActions } from "@/src/modules/sales/backend/infra/sales-factory";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { handleResult } from "@/src/shared/backend/utils/handle-result";

const bodySchema = z.object({ allowNegativeStock: z.boolean().optional(), priceListId: z.string().min(1).max(128).nullable().optional() }).strict();

/** Confirms a draft through the transactionally authorized commercial-security boundary. */
export const POST = withTenantPermission("sales.confirm", async (request, tenant) => {
  try {
    const invoiceId = new URL(request.url).pathname.split("/").at(-2);
    if (!invoiceId) return Response.json({ error: "La factura no es válida." }, { status: 400 });
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const authorization = await resolveCanonicalTenantAuthorization(tenant);
    if (!authorization) return Response.json({ error: "Sin acceso a la organización." }, { status: 403 });
    const source = new ServerSupabaseSource();
    const { data: invoice, error } = await source.instance.from("shared_inventory_sales_invoices").select("company_id").eq("tenant_id", tenant.tenantId).eq("id", invoiceId).maybeSingle();
    if (error) throw error;
    if (!invoice?.company_id) return Response.json({ error: "La factura no existe." }, { status: 404 });
    await getSalesActions(tenant.tenantId).securedSales.confirm({
      actorUserId: tenant.userId, organizationId: authorization.organizationId, companyId: invoice.company_id, invoiceId,
      allowNegativeStock: body.allowNegativeStock === true && authorization.snapshot.role.hasPermission(permissionCode("inventory.negative_stock.use")),
      priceListId: body.priceListId, salesRegisterId: tenant.barcodeTerminalId ?? null, deviceId: tenant.barcodeTerminalId ?? null,
    });
    return handleResult(await getSalesActions(tenant.tenantId).getSalesInvoice.execute({ invoiceId }));
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
    if (error instanceof SalesFailure) return Response.json({ error: error.message, code: error.code }, { status: error.code === "SALES_NOT_FOUND" ? 404 : error.code === "SALES_ACCESS_DENIED" ? 403 : error.code === "SALES_REPOSITORY_UNAVAILABLE" ? 503 : 409 });
    return Response.json({ error: "No se pudo confirmar la factura." }, { status: 500 });
  }
});
