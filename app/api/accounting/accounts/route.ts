// Read-only route for accounts consumed by journal and integration screens.
import { withTenant }             from '@/src/shared/backend/utils/require-tenant';
import { handleResult }           from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions }   from '@/src/modules/accounting/backend/infrastructure/accounting-factory';

export const GET = withTenant(async (req, { tenantId }) => {
    const companyId   = new URL(req.url).searchParams.get('companyId') ?? '';
    const result      = await getAccountingActions(tenantId).getAccounts.execute(companyId);
    return handleResult(result);
});

