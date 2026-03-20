import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId }) => {
    const empresaId = new URL(req.url).searchParams.get('empresaId');
    if (!empresaId) return Response.json({ error: 'empresaId es requerido' }, { status: 400 });
    const result = await getInventoryActions(userId).getFacturasCompra.execute({ empresaId });
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId }) => {
    const body = await req.json();
    const { factura, items } = body;
    if (!factura || !items) return Response.json({ error: 'factura e items son requeridos' }, { status: 400 });
    const result = await getInventoryActions(userId).saveFacturaCompra.execute({ factura, items });
    return handleResult(result);
});
