// API route for confirming a purchase invoice.
// Interface adapter — delegates to use case via factory, no business logic here.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const POST = withTenant(async (req, { userId }) => {
    // URL pattern: /api/inventory/entradas/[id]/confirmar
    const segments  = new URL(req.url).pathname.split('/');
    const invoiceId = segments[segments.length - 2];
    const result    = await getInventoryActions(userId).confirmPurchaseInvoice.execute({ invoiceId });
    return handleResult(result);
});
