// API route for deleting a single inventory supplier by id.
// Interface adapter — delegates to use case via factory.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const DELETE = withTenant(async (req, { userId }) => {
    const id = req.url.split('/').pop()!;
    const result = await getInventoryActions(userId).deleteSupplier.execute({ id });
    return handleResult(result);
});
