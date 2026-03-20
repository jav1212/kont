import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId }) => {
    // Extract id — URL pattern: /api/inventory/compras/[id]
    const segments = new URL(req.url).pathname.split('/');
    const id = segments[segments.length - 1];
    const result = await getInventoryActions(userId).getFacturaCompra.execute({ facturaId: id });
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId }) => {
    const segments = new URL(req.url).pathname.split('/');
    const id = segments[segments.length - 1];
    const body = await req.json();
    const { factura, items } = body;
    if (!factura || !items) return Response.json({ error: 'factura e items son requeridos' }, { status: 400 });
    const result = await getInventoryActions(userId).saveFacturaCompra.execute({
        factura: { ...factura, id },
        items,
    });
    return handleResult(result);
});
