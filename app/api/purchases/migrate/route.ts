// API route for bulk-migrating purchase invoices between companies in the same tenant.
// Interface adapter — delegates inventory side to the use case via factory, then
// fans out accounting integration calls (reverse in source company + process in
// destination company) for invoices that were confirmed at migration time.
// Accounting calls are non-blocking by design (handled inside the accounting
// use case): an integration failure is logged but does not undo inventory.
import { getPurchasesActions }   from '@/src/modules/purchases/backend/infra/purchases-factory';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';

export const POST = withTenant(async (req, { userId, actingAs, effectiveOwnerId}) => {
    const body = await req.json().catch(() => null) as
        | { invoiceIds?: unknown; targetCompanyId?: unknown; targetPeriod?: unknown }
        | null;

    const invoiceIds = Array.isArray(body?.invoiceIds)
        ? (body!.invoiceIds.filter((x) => typeof x === 'string') as string[])
        : [];
    const targetCompanyId = typeof body?.targetCompanyId === 'string'
        ? body!.targetCompanyId
        : '';
    const targetPeriod = typeof body?.targetPeriod === 'string' && body!.targetPeriod.trim() !== ''
        ? body!.targetPeriod.trim()
        : null;

    if (invoiceIds.length === 0) {
        return Response.json({ error: 'invoiceIds es requerido' }, { status: 400 });
    }
    if (!targetCompanyId) {
        return Response.json({ error: 'targetCompanyId es requerido' }, { status: 400 });
    }

    const ownerId = effectiveOwnerId;
    const result  = await getPurchasesActions(ownerId)
        .migratePurchaseInvoices.execute({ invoiceIds, targetCompanyId, targetPeriod });

    if (result.isSuccess) {
        const value = result.getValue();
        const accounting = getAccountingActions(ownerId);

        // Para cada factura que estaba confirmada al momento de migrar:
        //   1. revertir asientos en empresa origen
        //   2. generar asientos en empresa destino (con la misma sourceRef =
        //      invoiceId, así un futuro unconfirm/desconfirm sigue limpiando)
        await Promise.all(
            value.migrated
                .filter((m) => m.wasConfirmed)
                .map(async (m) => {
                    await accounting.reverseInventoryPurchaseIntegration.execute({
                        companyId: m.sourceCompanyId,
                        invoiceId: m.id,
                    });
                    await accounting.processInventoryPurchaseIntegration.execute({
                        companyId: m.targetCompanyId,
                        invoiceId: m.id,
                        date:      m.date,
                        subtotal:  m.subtotal,
                        vatAmount: m.vatAmount,
                        total:     m.total,
                    });
                }),
        );
    }

    return handleResult(result);
});
