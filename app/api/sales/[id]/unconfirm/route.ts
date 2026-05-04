import { getSalesActions } from '@/src/modules/sales/backend/infra/sales-factory';
import { withTenant }      from '@/src/shared/backend/utils/require-tenant';
import { handleResult }    from '@/src/shared/backend/utils/handle-result';

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const segments  = new URL(req.url).pathname.split('/');
    const invoiceId = segments[segments.length - 2];
    const ownerId   = actingAs?.ownerId ?? userId;
    const result    = await getSalesActions(ownerId).unconfirmSalesInvoice.execute({ invoiceId });
    return handleResult(result);
});
