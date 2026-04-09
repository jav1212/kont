// Route handler for a specific chart: PATCH (rename) and DELETE.
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';

export const PATCH = withTenant(async (req, { userId, actingAs }) => {
    const ownerId              = actingAs?.ownerId ?? userId;
    const id                   = req.url.split('/').pop()!;
    const body                 = await req.json() as { companyId?: string; name?: string };
    const { companyId, name }  = body;
    if (!companyId || !name?.trim()) {
        return new Response(JSON.stringify({ error: 'companyId y name son requeridos' }), { status: 400 });
    }
    const result = await getAccountingActions(ownerId).saveChart.execute({ id, companyId, name });
    return handleResult(result);
});

export const DELETE = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const id      = req.url.split('/').pop()!;
    const result  = await getAccountingActions(ownerId).deleteChart.execute(id);
    return handleResult(result);
});
