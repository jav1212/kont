import { z } from 'zod';
import { getPurchasesActions } from '@/src/modules/purchases/backend/infra/purchases-factory';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';
import { requirePermission, withTenant } from '@/src/shared/backend/utils/require-tenant';
import { handleResult } from '@/src/shared/backend/utils/handle-result';

const executeSchema = z.object({ companyId: z.string().min(1), mode: z.enum(['draft', 'confirm']), revision: z.number().int().positive() });

/** Executes a persisted, server-recomputed import and processes accounting for confirmed invoices. */
export const POST = withTenant(async (req, tenant) => {
    const body = await req.json().catch(() => null);
    const parsed = executeSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Formato de ejecución inválido' }, { status: 400 });
    await requirePermission(tenant, parsed.data.mode === 'confirm' ? 'purchases.confirm' : 'purchases.create', { req });
    const id = new URL(req.url).pathname.split('/').at(-2) ?? '';
    const actions = getPurchasesActions(tenant.tenantId);
    const staged = await actions.getPurchaseCsvImport.execute({ id, companyId: parsed.data.companyId });
    if (staged.isFailure) return handleResult(staged, 400, req);
    if (staged.getValue().rows.some(row => row.selected && Object.values(row.productResolutions).some(resolution => resolution.create))) {
        await requirePermission(tenant, 'inventory.create', { req });
    }
    const result = await actions.executePurchaseCsvImport.execute({ id, ...parsed.data });
    if (result.isSuccess && parsed.data.mode === 'confirm') {
        const accounting = getAccountingActions(tenant.tenantId);
        for (const outcome of result.getValue()) {
            if (!outcome.invoiceId || outcome.status !== 'confirmed' || outcome.idempotent) continue;
            const invoice = await actions.getPurchaseInvoice.execute({ invoiceId: outcome.invoiceId });
            if (invoice.isSuccess) await accounting.processInventoryPurchaseIntegration.execute({ companyId: invoice.getValue().companyId, invoiceId: outcome.invoiceId, date: invoice.getValue().date, subtotal: invoice.getValue().subtotal, vatAmount: invoice.getValue().vatAmount, total: invoice.getValue().total });
        }
    }
    return handleResult(result, 200, req);
});
