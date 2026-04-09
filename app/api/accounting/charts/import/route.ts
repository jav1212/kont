// Route handler for chart import: POST (bulk import from parsed file).
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';
import type { ImportAccountInput } from '@/src/modules/accounting/backend/domain/repository/chart.repository';

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const body    = await req.json() as Record<string, unknown>;
    const result  = await getAccountingActions(ownerId).importChart.execute({
        companyId: String(body.companyId ?? ''),
        name:      String(body.name ?? ''),
        accounts:  (body.accounts as ImportAccountInput[]) ?? [],
    });
    return handleResult(result, 201);
});
