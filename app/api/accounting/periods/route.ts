// Route handler for accounting periods collection: GET (list), POST (create/update).
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';
import type { SavePeriodInput } from '@/src/modules/accounting/backend/domain/repository/period.repository';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const ownerId   = actingAs?.ownerId ?? userId;
    const companyId = new URL(req.url).searchParams.get('companyId') ?? '';
    const result    = await getAccountingActions(ownerId).getPeriods.execute(companyId);
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const body    = await req.json() as SavePeriodInput;
    const result  = await getAccountingActions(ownerId).savePeriod.execute(body);
    return handleResult(result, 201);
});
