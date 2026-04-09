// Route handler for a specific chart: DELETE.
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';

export const DELETE = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const id      = req.url.split('/').pop()!;
    const result  = await getAccountingActions(ownerId).deleteChart.execute(id);
    return handleResult(result);
});
