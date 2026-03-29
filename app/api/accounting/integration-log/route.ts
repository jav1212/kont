// Route handler for the integration log: GET (most recent entries for a company).
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const ownerId   = actingAs?.ownerId ?? userId;
    const params    = new URL(req.url).searchParams;
    const companyId = params.get('companyId') ?? '';
    const limit     = Number(params.get('limit') ?? '100');
    const result    = await getAccountingActions(ownerId).getIntegrationLog.execute({ companyId, limit });
    return handleResult(result);
});
