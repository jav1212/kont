// Route handler to close an accounting period.
// URL pattern: POST /api/accounting/periods/{id}/close
import { withTenantPermission } from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';

export const POST = withTenantPermission('accounting.close', async (req, { effectiveOwnerId, tenantId}) => {
    const ownerId = effectiveOwnerId;
    const id      = req.url.split('/').at(-2)!;
    const result  = await getAccountingActions(tenantId).closePeriod.execute(id);
    return handleResult(result);
});
