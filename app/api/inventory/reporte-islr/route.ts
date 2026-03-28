// API route for the ISLR (income tax withholding) inventory report.
// Interface adapter — delegates to use case via factory, no business logic here.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId }) => {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    const period    = searchParams.get('period');
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    if (!period)    return Response.json({ error: 'period es requerido' },    { status: 400 });
    const result = await getInventoryActions(userId).getIslrReport.execute({ companyId, period });
    return handleResult(result);
});
