import { companyId } from "@kontave/companies/domain";
import { fiscalDocumentId, fiscalDocumentLineId } from "@kontave/fiscal/domain";
import { currency, moneyFromMinor } from "@kontave/monetary/domain";
import { createSupabaseSupplierInvoiceMatchActions } from "@kontave/purchasing/supabase";
import { goodsReceiptLineId, purchaseOrderLineId, purchaseQuantity, supplierId, supplierInvoiceMatchId, SupplierInvoiceMatch } from "@kontave/purchasing/domain";
import { UnitOfMeasure } from "@kontave/products/domain";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { PurchasingFailure } from "@kontave/purchasing/domain";

/** Saves a reviewed supplier-invoice allocation draft in the authorized company.
 * @param request Company, source document, supplier, and exact fiscal-line allocations.
 * @param tenant Authenticated actor with purchase-confirmation permission.
 * @returns The persisted draft or a scoped validation failure.
 */
export const POST = withTenantPermission("purchases.confirm", async (request, tenant) => {
  try {
    const body = object(await request.json());
    const company = required(body.companyId);
    const allocations = Array.isArray(body.allocations) ? body.allocations.map((value) => {
      const item = object(value);
      const rawMoney = object(item.netAmount);
      const rawCurrency = object(rawMoney.currency);
      return {
        fiscalLineId: fiscalDocumentLineId(required(item.fiscalLineId)),
        orderLineId: item.orderLineId === null || item.orderLineId === "" || item.orderLineId === undefined ? null : purchaseOrderLineId(required(item.orderLineId)),
        receiptLineId: item.receiptLineId === null || item.receiptLineId === "" || item.receiptLineId === undefined ? null : goodsReceiptLineId(required(item.receiptLineId)),
        invoicedQuantity: purchaseQuantity(required(item.quantity), enumUnit(item.unit)),
        netAmount: moneyFromMinor(BigInt(required(rawMoney.minorAmount)), currency(required(rawCurrency.code), Number(rawCurrency.minorUnit))),
      };
    }) : [];
    const rawCurrency = object(body.documentCurrency);
    const documentCurrency = currency(required(rawCurrency.code), Number(rawCurrency.minorUnit));
    const rawTotal = object(body.allocatedNetAmount);
    const match = new SupplierInvoiceMatch({
      id: supplierInvoiceMatchId(required(body.id)), companyId: companyId(company), supplierId: supplierId(required(body.supplierId)),
      fiscalDocumentId: fiscalDocumentId(required(body.fiscalDocumentId)), documentCurrency, allocations,
      allocatedNetAmount: moneyFromMinor(BigInt(required(rawTotal.minorAmount)), documentCurrency),
      status: "draft", confirmedAt: null, version: 0,
    });
    const authorization = await resolveCanonicalTenantAuthorization(tenant);
    if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
    const client = new ServerSupabaseSource().instance;
    const { data: found, error } = await client.from("shared_companies").select("id")
      .eq("tenant_id", tenant.tenantId).eq("organization_id", authorization.organizationId).eq("id", company).maybeSingle();
    if (error) return Response.json({ error: "No fue posible validar la empresa." }, { status: 503 });
    if (!found) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const actions = createSupabaseSupplierInvoiceMatchActions(client);
    const saved = await actions.saveDraft.execute({
      scope: { tenantId: tenant.tenantId, organizationId: authorization.organizationId, companyId: company },
      match, actorId: tenant.userId,
    });
    return Response.json({ data: JSON.parse(JSON.stringify(saved, (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value)) }, { status: 201 });
  } catch (cause) {
    if (cause instanceof PurchasingFailure) return Response.json({ error: cause.message, code: cause.code }, { status: 422 });
    console.error("fiscal.iva.purchase_match.save_failed", { cause });
    return Response.json({ error: "No fue posible guardar la conciliación." }, { status: 400 });
  }
});

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Se esperaba un objeto JSON.");
  return value as Record<string, unknown>;
}
function required(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw new Error("Falta un campo obligatorio.");
  return value.trim();
}
function enumUnit(value: unknown): UnitOfMeasure {
  if (typeof value !== "string" || !Object.values(UnitOfMeasure).includes(value as UnitOfMeasure)) throw new Error("Unidad inválida.");
  return value as UnitOfMeasure;
}
