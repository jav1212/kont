import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId }) => {
    const { searchParams } = new URL(req.url);
    const empresaId = searchParams.get('empresaId');
    const periodo   = searchParams.get('periodo');
    if (!empresaId) return Response.json({ error: 'empresaId es requerido' }, { status: 400 });
    if (!periodo)   return Response.json({ error: 'periodo es requerido' },   { status: 400 });
    const result = await getInventoryActions(userId).getReporteSaldo.execute({ empresaId, periodo });
    return handleResult(result);
});
