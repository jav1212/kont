// Route handler for accounting charts: GET (list), POST (create).
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const ownerId    = actingAs?.ownerId ?? userId;
    const companyId  = new URL(req.url).searchParams.get('companyId') ?? '';
    const result     = await getAccountingActions(ownerId).getCharts.execute(companyId);
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const body    = await req.json() as Record<string, unknown>;
    const result  = await getAccountingActions(ownerId).saveChart.execute({
        id:        typeof body.id === 'string' ? body.id : undefined,
        companyId: String(body.companyId ?? ''),
        name:      String(body.name ?? ''),
    });
    return handleResult(result, 201);
});
