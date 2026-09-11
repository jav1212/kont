import { getSalesActions } from '@/src/modules/sales/backend/infra/sales-factory';
import { withTenantPermission } from '@/src/shared/backend/utils/require-tenant';
import { handleResult }    from '@/src/shared/backend/utils/handle-result';

export const DELETE = withTenantPermission('sales.update', async (req, { userId, actingAs, effectiveOwnerId, tenantId}) => {
    const id      = new URL(req.url).pathname.split('/').pop()!;
    const ownerId = effectiveOwnerId;
    const result  = await getSalesActions(tenantId).deleteCustomer.execute({ id });
    return handleResult(result);
});
