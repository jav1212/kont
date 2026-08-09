// API route for inventory products.
// Interface adapter — delegates to use cases via factory, no business logic here.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenantPermission } from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const GET = withTenantPermission('inventory.read', async (req, { effectiveOwnerId, tenantId}) => {
    const companyId = new URL(req.url).searchParams.get('companyId');
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    const ownerId = effectiveOwnerId;
    const result = await getInventoryActions(tenantId).listProducts.execute({ companyId });
    return handleResult(result);
});

export const POST = withTenantPermission('inventory.create', async (req, { effectiveOwnerId, tenantId}) => {
    const body = await req.json();
    const ownerId = effectiveOwnerId;
    const result = await getInventoryActions(tenantId).saveProduct.execute(body);
    return handleResult(result);
});
