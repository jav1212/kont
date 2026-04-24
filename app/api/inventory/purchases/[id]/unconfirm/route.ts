// API route for unconfirming a purchase invoice.
// Interface adapter — delegates to use case via factory, no business logic here.
// Reverts stock movements + costo_promedio adjustments made when the invoice
// was confirmed, and flips estado back to 'borrador'. Used by the edit-from-list
// flow to allow rate/decimals/items corrections on already-confirmed invoices.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const segments  = new URL(req.url).pathname.split('/');
    const invoiceId = segments[segments.length - 2];
    const ownerId   = actingAs?.ownerId ?? userId;
    const result    = await getInventoryActions(ownerId).unconfirmPurchaseInvoice.execute({ invoiceId });
    return handleResult(result);
});
