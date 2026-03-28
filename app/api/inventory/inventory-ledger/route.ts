// API route for the inventory ledger (libro de inventarios), filtered by year.
// Interface adapter — delegates to use case via factory, no business logic here.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId }) => {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    const yearStr   = searchParams.get('year');
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    if (!yearStr)   return Response.json({ error: 'year es requerido' },       { status: 400 });
    const year = parseInt(yearStr, 10);
    if (isNaN(year)) return Response.json({ error: 'year inválido' }, { status: 400 });
    const result = await getInventoryActions(userId).getInventoryLedger.execute({ companyId, year });
    return handleResult(result);
});
