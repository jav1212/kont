// API route for unconfirming a purchase invoice.
// Interface adapter — delegates to use case via factory, no business logic here.
// Reverts stock movements + costo_promedio adjustments made when the invoice
// was confirmed, and flips estado back to 'borrador'. Used by the edit-from-list
// flow to allow rate/decimals/items corrections on already-confirmed invoices.
// After unconfirm, also reverses the accounting entries generated on confirm
// (non-blocking) so inventory and accounting stay consistent.
import { getInventoryActions }  from '@/src/modules/inventory/backend/infra/inventory-factory';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const segments  = new URL(req.url).pathname.split('/');
    const invoiceId = segments[segments.length - 2];
    const ownerId   = actingAs?.ownerId ?? userId;
    const result    = await getInventoryActions(ownerId).unconfirmPurchaseInvoice.execute({ invoiceId });

    // Non-blocking: reverse the accounting integration that ran on confirmation.
    if (result.isSuccess) {
        const invoice = result.getValue();
        await getAccountingActions(ownerId).reverseInventoryPurchaseIntegration.execute({
            companyId: invoice.companyId,
            invoiceId: invoice.id ?? invoiceId,
        });
    }

    return handleResult(result);
});
