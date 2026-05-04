// API route for inventory suppliers.
// Interface adapter — delegates to use cases via factory, no business logic here.
import { getPurchasesActions } from '@/src/modules/purchases/backend/infra/purchases-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const companyId = new URL(req.url).searchParams.get('companyId');
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getPurchasesActions(ownerId).listSuppliers.execute({ companyId });
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const body = await req.json();
    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getPurchasesActions(ownerId).saveSupplier.execute(body);
    return handleResult(result);
});
