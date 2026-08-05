// Route handler for a specific integration rule: DELETE.
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';

export const DELETE = withTenant(async (req, { userId, actingAs, effectiveOwnerId, tenantId}) => {
    const ownerId = effectiveOwnerId;
    const id      = req.url.split('/').pop()!;
    const result  = await getAccountingActions(tenantId).deleteIntegrationRule.execute(id);
    return handleResult(result);
});
