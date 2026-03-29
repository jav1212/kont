// Route handler to post (finalize) a draft journal entry.
// URL pattern: POST /api/accounting/entries/{id}/post
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    // URL: /api/accounting/entries/{id}/post  → second-to-last segment is the id
    const id      = req.url.split('/').at(-2)!;
    const result  = await getAccountingActions(ownerId).postEntry.execute(id);
    return handleResult(result);
});
