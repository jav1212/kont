import { getSalesActions } from '@/src/modules/sales/backend/infra/sales-factory';
import { withTenant }      from '@/src/shared/backend/utils/require-tenant';
import { handleResult }    from '@/src/shared/backend/utils/handle-result';

export const DELETE = withTenant(async (req, { userId, actingAs }) => {
    const id      = new URL(req.url).pathname.split('/').pop()!;
    const ownerId = actingAs?.ownerId ?? userId;
    const result  = await getSalesActions(ownerId).deleteCustomer.execute({ id });
    return handleResult(result);
});
