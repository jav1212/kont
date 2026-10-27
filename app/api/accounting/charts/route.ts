// Read-only route for accounting charts.
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';

export const GET = withTenant(async (req, { tenantId }) => {
    const companyId  = new URL(req.url).searchParams.get('companyId') ?? '';
    const result     = await getAccountingActions(tenantId).getCharts.execute(companyId);
    return handleResult(result);
});

