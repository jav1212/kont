import { companyId } from "@kontave/companies/domain";
import { currency, moneyFromMinor } from "@kontave/monetary/domain";
import { createSupabaseSupplierInvoiceMatchActions } from "@kontave/purchasing/supabase";
import { supplierInvoiceMatchId, PurchasingFailure } from "@kontave/purchasing/domain";
import type { FiscalDocumentFactMetadata } from "@kontave/tax-reporting/fiscal-document-mapper";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

/** Confirms a reviewed supplier-invoice match and atomically recognizes its VAT fact.
 * @param request Company and explicit recognition, counterparty, and credit evidence.
 * @param tenant Authenticated actor with purchase-confirmation permission.
 * @returns The confirmed match or a scope, evidence, or persistence failure.
 */
export const POST = withTenantPermission("purchases.confirm", async (request, tenant) => {
  try {
    const id = decodeURIComponent(new URL(request.url).pathname.split("/").at(-2) ?? "");
    const body = record(await request.json());
    const company = required(body.companyId);
    const raw = record(body.factMetadata);
    const money = (value: unknown) => {
      const input = record(value);
      const moneyCurrency = record(input.currency);
      return moneyFromMinor(BigInt(required(input.minorAmount)), currency(required(moneyCurrency.code), Number(moneyCurrency.minorUnit)));
    };
    const deductibleState = raw.deductibleState;
    const deductible = deductibleState === "eligible" || deductibleState === "ineligible" || deductibleState === "pending_review"
      ? { state: deductibleState as "eligible" | "ineligible" | "pending_review", amount: money(raw.deductibleAmount), reason: typeof raw.deductibleReason === "string" ? raw.deductibleReason : null }
      : undefined;
    const metadata: FiscalDocumentFactMetadata = {
      factId: required(raw.factId), lineageKey: required(raw.lineageKey), recognitionDate: required(raw.recognitionDate),
      counterpartyCountryCode: raw.counterpartyCountryCode === null ? null : required(raw.counterpartyCountryCode),
      deductible,
      withholding: raw.withholding === null ? null : (() => {
        const item = record(raw.withholding);
        if (item.kind !== "practiced" && item.kind !== "suffered") throw new Error("Tipo de retención inválido.");
        return { kind: item.kind, amount: money(item.amount), certificateReference: typeof item.certificateReference === "string" ? item.certificateReference : null, occurredAt: required(item.occurredAt) };
      })(),
      affectedFactId: raw.affectedFactId === null ? null : required(raw.affectedFactId), recordedAt: required(raw.recordedAt),
    };
    const authorization = await resolveCanonicalTenantAuthorization(tenant);
    if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
    const client = new ServerSupabaseSource().instance;
    const { data: found, error } = await client.from("shared_companies").select("id")
      .eq("tenant_id", tenant.tenantId).eq("organization_id", authorization.organizationId).eq("id", company).maybeSingle();
    if (error) return Response.json({ error: "No fue posible validar la empresa." }, { status: 503 });
    if (!found) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const actions = createSupabaseSupplierInvoiceMatchActions(client);
    const match = await actions.confirm.execute({
      scope: { tenantId: tenant.tenantId, organizationId: authorization.organizationId, companyId: companyId(company) },
      id: supplierInvoiceMatchId(id), occurredAt: new Date().toISOString(), actorId: tenant.userId, factMetadata: metadata,
    });
    return Response.json({ data: JSON.parse(JSON.stringify(match, (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value)) });
  } catch (cause) {
    if (cause instanceof PurchasingFailure) return Response.json({ error: cause.message, code: cause.code }, { status: 422 });
    console.error("fiscal.iva.purchase_match.confirm_failed", { cause });
    return Response.json({ error: "No fue posible confirmar la conciliación." }, { status: 400 });
  }
});

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Se esperaba un objeto JSON.");
  return value as Record<string, unknown>;
}
function required(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw new Error("Falta un campo obligatorio.");
  return value.trim();
}
