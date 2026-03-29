// Route handler for a specific journal entry: GET (with lines).
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const id      = req.url.split('/').at(-1)!;
    const result  = await getAccountingActions(ownerId).getEntryWithLines.execute(id);
    return handleResult(result);
});
