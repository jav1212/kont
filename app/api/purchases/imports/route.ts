import { z } from 'zod';
import { getPurchasesActions } from '@/src/modules/purchases/backend/infra/purchases-factory';
import { requirePermission, withTenant } from '@/src/shared/backend/utils/require-tenant';
import { handleResult } from '@/src/shared/backend/utils/handle-result';

const decimal = z.string().regex(/^[+-]?\d{1,12}(?:\.\d{1,12})?$/);
const vatRate = z.enum(['exenta', 'reducida_8', 'general_16']);
const header = z.object({ sourceRow: z.number().int().positive(), date: z.string(), supplierName: z.string(), supplierRif: z.string(), documentNumber: z.string(), controlNumber: z.string(), reference: z.string(), supplierExternalId: z.string(), currency: z.string(), totalBs: decimal, documentType: z.string(), exchangeRate: decimal });
const item = z.object({ sourceRow: z.number().int().positive(), quantity: decimal, code: z.string(), description: z.string(), unitCostBs: decimal, subtotalBs: decimal, fullCostBs: decimal, currencyCost: decimal, currencySubtotal: decimal, currencyFullCost: decimal, salePrice: decimal, markupPercent: decimal, currency: z.string(), exchangeRate: decimal, purchaseVatCode: z.string(), date: z.string(), documentNumber: z.string(), supplierExternalId: z.string(), sourceStock: decimal, saleVatCode: z.string() });
const salePricing = z.union([
    z.object({ mode: z.literal('fixed'), amount: z.number().finite(), currency: z.string() }),
    z.object({ mode: z.literal('markup'), percentage: z.number().finite(), currency: z.string() }),
]);
const resolution = z.object({ productId: z.string().min(1).optional(), create: z.object({ name: z.string(), measureUnit: z.enum(['unidad', 'kg', 'g', 'm', 'm2', 'm3', 'litro', 'galon', 'caja', 'rollo', 'paquete']), valuationMethod: z.enum(['promedio_ponderado', 'peps']), vatType: z.enum(['exento', 'general']), salePricing: salePricing.optional() }).optional() });
const config = z.object({ costsIncludeVat: z.boolean(), vatMappings: z.record(z.string(), vatRate), reviewed: z.boolean() });
const row = z.object({ header, items: z.array(item), selected: z.boolean(), supplierId: z.string().min(1).optional(), productResolutions: z.record(z.string(), resolution), acceptDifference: z.boolean(), configOverride: config.optional() });
const saveSchema = z.object({ id: z.string().min(1).optional(), revision: z.number().int().positive().optional(), companyId: z.string().min(1), fileName: z.string().min(1).max(255), companyRif: z.string(), rows: z.array(row).min(1).max(10000), config, targetInvoiceId: z.string().min(1).optional() }).superRefine((value, context) => {
    if (value.rows.reduce((count, current) => count + current.items.length, 0) > 10_000) context.addIssue({ code: 'custom', message: 'El máximo es 10.000 detalles por importación' });
});

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const bodyTooLarge = (request: Request): boolean => Number(request.headers.get('content-length') ?? 0) > MAX_IMPORT_BYTES;

/** Lists staged guided CSV imports for the active company. */
export const GET = withTenant(async (req, tenant) => {
    await requirePermission(tenant, 'purchases.read', { req });
    const companyId = new URL(req.url).searchParams.get('companyId');
    const invoiceId = new URL(req.url).searchParams.get('invoiceId');
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    const actions = getPurchasesActions(tenant.tenantId);
    if (invoiceId) return handleResult(await actions.getPurchaseCsvImportByInvoice.execute({ invoiceId, companyId }), 200, req);
    return handleResult(await actions.listPurchaseCsvImports.execute({ companyId }), 200, req);
});

/** Stores a client-parsed, strictly whitelisted CSV import snapshot. */
export const POST = withTenant(async (req, tenant) => {
    await requirePermission(tenant, 'purchases.create', { req });
    if (bodyTooLarge(req)) return Response.json({ error: 'El archivo procesado supera el límite de 10 MB' }, { status: 413 });
    const text = await req.text();
    if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) return Response.json({ error: 'El archivo procesado supera el límite de 10 MB' }, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = null; }
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Formato de importación inválido', details: parsed.error.flatten() }, { status: 400 });
    if (parsed.data.rows.some((entry) => Object.values(entry.productResolutions).some((resolution) => resolution.create != null))) {
        await requirePermission(tenant, 'inventory.create', { req });
    }
    return handleResult(await getPurchasesActions(tenant.tenantId).savePurchaseCsvImport.execute(parsed.data), 200, req);
});
