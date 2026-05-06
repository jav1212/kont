// API route for deleting a single inventory supplier by id.
// Interface adapter — delegates to use case via factory.
import { getPurchasesActions } from '@/src/modules/purchases/backend/infra/purchases-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const DELETE = withTenant(async (req, { userId, actingAs, effectiveOwnerId}) => {
    const id = req.url.split('/').pop()!;
    const ownerId = effectiveOwnerId;
    const result = await getPurchasesActions(ownerId).deleteSupplier.execute({ id });
    return handleResult(result);
});
