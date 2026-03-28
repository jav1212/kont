// API route for inventory transformations.
// Interface adapter — delegates to use cases via factory, no business logic here.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId }) => {
    const companyId = new URL(req.url).searchParams.get('companyId');
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    const result = await getInventoryActions(userId).listTransformations.execute({ companyId });
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId }) => {
    const body = await req.json();
    const result = await getInventoryActions(userId).saveTransformation.execute(body);
    return handleResult(result);
});
