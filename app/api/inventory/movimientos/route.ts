import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId }) => {
    const url = new URL(req.url);
    const empresaId = url.searchParams.get('empresaId');
    const periodo   = url.searchParams.get('periodo') ?? undefined;
    if (!empresaId) return Response.json({ error: 'empresaId es requerido' }, { status: 400 });
    const result = await getInventoryActions(userId).getMovimientos.execute({ empresaId, periodo });
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId }) => {
    const body = await req.json();
    const result = await getInventoryActions(userId).saveMovimiento.execute(body);
    return handleResult(result);
});
