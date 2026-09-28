import { encodeFiscalDocument } from "@kontave/fiscal/supabase";
import { FiscalFailure } from "@kontave/fiscal/domain";
import { SalesFailure } from "@kontave/sales/domain";
import { TaxationFailure } from "@kontave/taxation/domain";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { createSalesFiscalActions } from "@/src/modules/sales/backend/infra/fiscal/sales-fiscal-factory";

/**
 * Prepares a persisted fiscal draft from a confirmed service-only sales invoice.
 * @param request - Authorized request containing the source company ID in its query.
 * @returns The immutable fiscal draft and idempotent replay indicator.
 * @throws Expected source, identity, or taxation failures are returned as client errors.
 */
export const POST = withTenantPermission("sales.create", async (request, tenant) => {
  const rawId = new URL(request.url).pathname.split("/").filter(Boolean).at(-2) ?? "";
  let id = "";
  try { id = decodeURIComponent(rawId); } catch { return Response.json({ error: "Identidad de factura inválida." }, { status: 400 }); }
  const requestedCompanyId = new URL(request.url).searchParams.get("companyId")?.trim() ?? "";
  if (!id || id.length > 256 || !requestedCompanyId || requestedCompanyId.length > 256) {
    return Response.json({ error: "Identidad de factura o empresa inválida." }, { status: 400 });
  }
  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });

  const client = new ServerSupabaseSource().instance;
  const { data: company, error: companyError } = await client.from("shared_companies").select("id")
    .eq("tenant_id", tenant.tenantId).eq("organization_id", authorization.organizationId)
    .eq("id", requestedCompanyId).maybeSingle();
  if (companyError) return Response.json({ error: "No fue posible validar la empresa." }, { status: 500 });
  if (!company) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });

  try {
    const actions = createSalesFiscalActions({
      tenantId: tenant.tenantId,
      actorId: tenant.userId,
      organizationId: authorization.organizationId,
      companyId: requestedCompanyId,
    });
    const result = await actions.prepareConfirmedServiceInvoice.execute({
      scope: actions.scope,
      invoiceId: id,
      actorId: tenant.userId,
      occurredAt: new Date().toISOString(),
    });
    return Response.json({
      data: { document: JSON.parse(encodeFiscalDocument(result.document)), replayed: result.replayed },
    });
  } catch (cause) {
    if (cause instanceof SalesFailure) {
      const status = cause.code === "SALES_NOT_FOUND" ? 404
        : cause.code === "SALES_FISCAL_PREPARATION_INVALID" || cause.code === "SALES_FISCAL_TAX_UNRESOLVED" ? 422
          : 409;
      return Response.json({ error: cause.message, code: cause.code }, { status });
    }
    if (cause instanceof TaxationFailure) {
      return Response.json({ error: cause.message, code: cause.code }, {
        status: cause.code === "TAXATION_REPOSITORY_UNAVAILABLE" ? 503 : 422,
      });
    }
    if (cause instanceof FiscalFailure) {
      return Response.json({ error: cause.message, code: cause.code }, {
        status: cause.code.includes("IDEMPOTENCY") || cause.code.includes("SOURCE_CONFLICT") ? 409 : 503,
      });
    }
    console.error("fiscal.sales_invoice.prepare_failed", { invoiceId: id, cause });
    return Response.json({ error: "No fue posible preparar el borrador fiscal." }, { status: 500 });
  }
});
