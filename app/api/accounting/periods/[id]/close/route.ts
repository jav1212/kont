// Route handler to close an accounting period.
// URL pattern: POST /api/accounting/periods/{id}/close
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const id      = req.url.split('/').at(-2)!;
    const result  = await getAccountingActions(ownerId).closePeriod.execute(id);
    return handleResult(result);
});
