import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const POST = withTenant(async (req, { userId }) => {
    // URL pattern: /api/inventory/compras/[id]/confirmar
    const segments = new URL(req.url).pathname.split('/');
    const facturaId = segments[segments.length - 2];
    const result = await getInventoryActions(userId).confirmarFacturaCompra.execute({ facturaId });
    return handleResult(result);
});
