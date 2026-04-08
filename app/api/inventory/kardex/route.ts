// API route for inventory kardex (product movement ledger).
// Interface adapter — delegates to use case via factory, no business logic here.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const url       = new URL(req.url);
    const companyId = url.searchParams.get('companyId');
    const productId = url.searchParams.get('productId');
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    if (!productId) return Response.json({ error: 'productId es requerido' }, { status: 400 });
    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getInventoryActions(ownerId).getKardex.execute({ companyId, productId });
    return handleResult(result);
});
