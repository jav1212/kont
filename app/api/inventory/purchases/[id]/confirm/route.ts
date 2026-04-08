// API route for confirming a purchase invoice.
// Interface adapter — delegates to use case via factory, no business logic here.
// After confirmation, triggers accounting integration (non-blocking).
import { getInventoryActions }  from '@/src/modules/inventory/backend/infra/inventory-factory';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';

export const POST = withTenant(async (req, { userId, actingAs }) => {
    // URL pattern: /api/inventory/purchases/[id]/confirm
    const segments  = new URL(req.url).pathname.split('/');
    const invoiceId = segments[segments.length - 2];
    const ownerId   = actingAs?.ownerId ?? userId;
    const result    = await getInventoryActions(ownerId).confirmPurchaseInvoice.execute({ invoiceId });

    // Non-blocking: trigger accounting integration after successful confirmation.
    if (result.isSuccess) {
        const invoice = result.getValue();
        await getAccountingActions(ownerId).processInventoryPurchaseIntegration.execute({
            companyId:  invoice.companyId,
            invoiceId:  invoice.id ?? invoiceId,
            date:       invoice.date,
            subtotal:   invoice.subtotal,
            vatAmount:  invoice.vatAmount,
            total:      invoice.total,
        });
    }

    return handleResult(result);
});
