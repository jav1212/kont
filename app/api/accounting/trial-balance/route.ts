// Route handler for the trial balance report.
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';

export const GET = withTenant(async (req, { userId, actingAs, effectiveOwnerId, tenantId}) => {
    const ownerId   = effectiveOwnerId;
    const params    = new URL(req.url).searchParams;
    const companyId = params.get('companyId') ?? '';
    const periodId  = params.get('periodId') ?? undefined;
    const result    = await getAccountingActions(tenantId).getTrialBalance.execute({ companyId, periodId });
    return handleResult(result);
});
