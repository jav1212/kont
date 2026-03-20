import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId }) => {
    const { searchParams } = new URL(req.url);
    const empresaId = searchParams.get('empresaId');
    const anioStr   = searchParams.get('anio');
    if (!empresaId) return Response.json({ error: 'empresaId es requerido' }, { status: 400 });
    if (!anioStr)   return Response.json({ error: 'anio es requerido' },      { status: 400 });
    const anio = parseInt(anioStr, 10);
    if (isNaN(anio)) return Response.json({ error: 'anio inválido' }, { status: 400 });
    const result = await getInventoryActions(userId).getLibroInventarios.execute({ empresaId, anio });
    return handleResult(result);
});
