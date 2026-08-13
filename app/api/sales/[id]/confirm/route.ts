import { getSalesActions } from '@/src/modules/sales/backend/infra/sales-factory';
import { withTenantPermission } from '@/src/shared/backend/utils/require-tenant';
import { handleResult }    from '@/src/shared/backend/utils/handle-result';

export const POST = withTenantPermission('sales.confirm', async (req, { tenantId }) => {
    // URL pattern: /api/sales/[id]/confirm
    const segments  = new URL(req.url).pathname.split('/');
    const invoiceId = segments[segments.length - 2];
    const body = await req.json().catch(() => ({})) as { allowNegativeStock?: boolean };
    const result = await getSalesActions(tenantId).confirmSalesInvoice.execute({
        invoiceId,
        allowNegativeStock: body.allowNegativeStock === true,
    });
    return handleResult(result);
});
