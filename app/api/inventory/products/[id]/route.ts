// API route for deleting a single inventory product by id.
// Interface adapter — delegates to use case via factory.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenantPermission } from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const DELETE = withTenantPermission('inventory.delete', async (req, { effectiveOwnerId, tenantId}) => {
    const id = req.url.split('/').pop()!;
    const ownerId = effectiveOwnerId;
    const result = await getInventoryActions(tenantId).deleteProduct.execute({ id });
    return handleResult(result);
});
