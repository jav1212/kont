import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId }) => {
    const url = new URL(req.url);
    const empresaId  = url.searchParams.get('empresaId');
    const productoId = url.searchParams.get('productoId');
    if (!empresaId)  return Response.json({ error: 'empresaId es requerido' }, { status: 400 });
    if (!productoId) return Response.json({ error: 'productoId es requerido' }, { status: 400 });
    const result = await getInventoryActions(userId).getKardex.execute({ empresaId, productoId });
    return handleResult(result);
});
