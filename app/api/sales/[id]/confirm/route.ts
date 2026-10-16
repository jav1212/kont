import { z } from "zod";
import { permissionCode } from "@kontave/access-control/domain";
import { SalesFailure } from "@kontave/sales/domain";
import { getSalesActions } from "@/src/modules/sales/backend/infra/sales-factory";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { createSupabaseConfirmedServiceFiscalActions, createSupabaseSalesInvoiceDocumentSeriesIssuance } from "@kontave/sales/supabase";
import { companyId } from "@kontave/companies/domain";
import { organizationId } from "@kontave/organizations/domain";
import type { FiscalDocumentFactMetadata } from "@kontave/tax-reporting/fiscal-document-mapper";
import { TaxationFailure } from "@kontave/taxation/domain";
import { encodeFiscalDocument } from "@kontave/fiscal/supabase";
import { encode as encodeTaxFact } from "@kontave/tax-reporting/supabase";
import { getCompanyBranchSelectionForWeb } from "@/src/modules/companies/backend/administration-web";

const factMetadataSchema = z.object({
  factId: z.string().min(1).max(128),
  lineageKey: z.string().min(1).max(128),
  recognitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  counterpartyCountryCode: z.string().regex(/^[A-Za-z]{2}$/).nullable(),
});
const fiscalIvaSchema = z.object({
  sourceUpdatedAt: z.string().datetime({ offset: true }),
  issuedAt: z.string().datetime({ offset: true }),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  idempotencyKey: z.string().min(8).max(128),
  seriesScope: z.literal("company"),
  seriesSelection: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("explicit"), seriesId: z.string().uuid() }),
    z.object({ kind: z.literal("policy") }),
  ]),
  factMetadata: factMetadataSchema,
}).strict();
const bodySchema = z.object({
  allowNegativeStock: z.boolean().optional(),
  priceListId: z.string().min(1).max(128).nullable().optional(),
  fiscalIva: fiscalIvaSchema.optional(),
}).strict();

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
    const branchSelection = await getCompanyBranchSelectionForWeb(tenant, authorization.organizationId, invoice.company_id);
    const selectedBranchId = branchSelection.branchId;
    const allowNegativeStock = body.allowNegativeStock === true && authorization.snapshot.role.hasPermission(permissionCode("inventory.negative_stock.use"));
    if (body.fiscalIva) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !serviceRoleKey) return Response.json({ error: "La emisión fiscal IVA no está configurada." }, { status: 503 });
      const { data: company, error: companyError } = await source.instance.from("shared_companies").select("id")
        .eq("tenant_id", tenant.tenantId).eq("organization_id", authorization.organizationId)
        .eq("id", invoice.company_id).maybeSingle();
      if (companyError) return Response.json({ error: "No fue posible validar la empresa." }, { status: 503 });
      if (!company) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });

      const fiscalActions = createSupabaseConfirmedServiceFiscalActions({
        url, serviceRoleKey, tenantId: tenant.tenantId, actorId: tenant.userId,
        organizationId: authorization.organizationId, companyId: invoice.company_id,
      });
      const candidate = await fiscalActions.prepareConfirmedServiceInvoice.prepareDraftCandidate({
        scope: fiscalActions.scope, invoiceId, actorId: tenant.userId, occurredAt: new Date().toISOString(),
      });
      if (candidate.sourceUpdatedAt !== body.fiscalIva.sourceUpdatedAt) {
        return Response.json({ error: "La factura cambió después de preparar sus datos fiscales. Vuelve a preparar la emisión.", code: "SALES_CONCURRENCY_CONFLICT" }, { status: 409 });
      }
      const issuedAt = body.fiscalIva.issuedAt;
      const metadata: FiscalDocumentFactMetadata = {
        ...body.fiscalIva.factMetadata,
        lineageKey: `sale:${invoiceId}`,
        recognitionDate: body.fiscalIva.factMetadata.recognitionDate,
        recordedAt: issuedAt,
        affectedFactId: null,
        withholding: null,
      };
      const issuance = await createSupabaseSalesInvoiceDocumentSeriesIssuance(source.instance).issue({
        actorUserId: tenant.userId,
        organizationId: authorization.organizationId,
        companyId: invoice.company_id,
        invoiceId,
        sourceUpdatedAt: candidate.sourceUpdatedAt,
        idempotencyKey: body.fiscalIva.idempotencyKey,
        documentSeriesScope: {
          kind: "company", organizationId: organizationId(authorization.organizationId), companyId: companyId(invoice.company_id),
        },
        documentSeriesSelection: body.fiscalIva.seriesSelection,
        allowNegativeStock,
        taxScope: { tenantId: tenant.tenantId, organizationId: organizationId(authorization.organizationId), companyId: invoice.company_id },
        fiscalDocumentDraft: candidate.document,
        fiscalIssueDate: body.fiscalIva.issueDate,
        issuedAt,
        factMetadata: metadata,
        priceListId: body.priceListId,
        branchId: selectedBranchId,
        deviceId: tenant.barcodeTerminalId ?? null,
        companyBranchId: selectedBranchId,
        salesRegisterId: selectedBranchId ? null : tenant.barcodeTerminalId ?? null,
      });
      return Response.json({
        data: { id: invoiceId, companyId: invoice.company_id, status: "confirmada", invoiceNumber: issuance.displayNumber },
        fiscalDocument: JSON.parse(encodeFiscalDocument(issuance.fiscalDocument)),
        taxFact: JSON.parse(encodeTaxFact(issuance.taxFact)),
        issuance: { displayNumber: issuance.displayNumber, seriesId: issuance.seriesId, replayed: issuance.replayed },
      }, { status: issuance.replayed ? 200 : 201 });
    }
    await getSalesActions(tenant.tenantId).securedSales.confirm({
      actorUserId: tenant.userId, organizationId: authorization.organizationId, companyId: invoice.company_id, invoiceId,
      allowNegativeStock, priceListId: body.priceListId, branchId: selectedBranchId, companyBranchId: selectedBranchId,
      salesRegisterId: tenant.barcodeTerminalId ?? null, deviceId: tenant.barcodeTerminalId ?? null,
    });
    return handleResult(await getSalesActions(tenant.tenantId).getSalesInvoice.execute({ invoiceId }));
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
    if (error instanceof SalesFailure) return Response.json({ error: error.message, code: error.code }, { status: error.code === "SALES_NOT_FOUND" ? 404 : error.code === "SALES_ACCESS_DENIED" ? 403 : error.code === "SALES_REPOSITORY_UNAVAILABLE" ? 503 : 409 });
    if (error instanceof TaxationFailure) return Response.json({ error: error.message, code: error.code }, { status: error.code === "TAXATION_REPOSITORY_UNAVAILABLE" ? 503 : 422 });
    return Response.json({ error: "No se pudo confirmar la factura." }, { status: 500 });
  }
});
