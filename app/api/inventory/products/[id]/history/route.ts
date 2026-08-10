import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenantPermission } from '@/src/shared/backend/utils/require-tenant';
import { handleResult } from '@/src/shared/backend/utils/handle-result';

export const GET = withTenantPermission('inventory.read', async (req, { tenantId }) => {
    const productId = decodeURIComponent(req.url.split('/products/')[1]?.split('/history')[0] ?? '');
    const companyId = new URL(req.url).searchParams.get('companyId');
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    if (!productId) return Response.json({ error: 'productId es requerido' }, { status: 400 });
    const result = await getInventoryActions(tenantId).getProductHistory.execute({ companyId, productId });
    return handleResult(result);
});
