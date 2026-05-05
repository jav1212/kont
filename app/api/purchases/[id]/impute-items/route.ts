// API route: imputa items a una factura confirmada (flujo rápido).
// Después de imputar, recalcula la integración contable con los nuevos
// montos para que el asiento original se reescriba si el total cambió.
import { getPurchasesActions }   from '@/src/modules/purchases/backend/infra/purchases-factory';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';

export const POST = withTenant(async (req, { userId, actingAs }) => {
    // URL pattern: /api/purchases/[id]/impute-items
    const segments  = new URL(req.url).pathname.split('/');
    const invoiceId = segments[segments.length - 2];
    const body      = await req.json();
    const { items } = body;
    if (!Array.isArray(items)) {
        return Response.json({ error: 'items debe ser un array' }, { status: 400 });
    }

    const ownerId = actingAs?.ownerId ?? userId;
    const result  = await getPurchasesActions(ownerId).imputePurchaseInvoiceItems.execute({
        invoiceId,
        items,
    });

    if (result.isSuccess) {
        const invoice = result.getValue();
        // Reescribir el asiento contable: el header se contabilizó al confirmar
        // con el total declarado. Tras imputar items, el header se recalcula
        // desde los items y los montos pueden cambiar — revertimos el asiento
        // anterior y creamos uno nuevo con los totales actualizados.
        const accounting = getAccountingActions(ownerId);
        await accounting.reverseInventoryPurchaseIntegration.execute({
            companyId: invoice.companyId,
            invoiceId: invoice.id ?? invoiceId,
        });
        await accounting.processInventoryPurchaseIntegration.execute({
            companyId: invoice.companyId,
            invoiceId: invoice.id ?? invoiceId,
            date:      invoice.date,
            subtotal:  invoice.subtotal,
            vatAmount: invoice.vatAmount,
            total:     invoice.total,
        });
    }

    return handleResult(result);
});
