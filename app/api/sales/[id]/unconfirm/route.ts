import { getSalesActions } from '@/src/modules/sales/backend/infra/sales-factory';
import { withTenantPermission } from '@/src/shared/backend/utils/require-tenant';
import { handleResult }    from '@/src/shared/backend/utils/handle-result';

export const POST = withTenantPermission('sales.cancel', async (req, { tenantId}) => {
    const segments  = new URL(req.url).pathname.split('/');
    const invoiceId = segments[segments.length - 2];
    const result    = await getSalesActions(tenantId).unconfirmSalesInvoice.execute({ invoiceId });
    return handleResult(result);
});
