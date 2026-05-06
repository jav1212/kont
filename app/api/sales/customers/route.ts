import { getSalesActions } from '@/src/modules/sales/backend/infra/sales-factory';
import { withTenant }      from '@/src/shared/backend/utils/require-tenant';
import { handleResult }    from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId, actingAs, effectiveOwnerId}) => {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    const ownerId = effectiveOwnerId;
    const result = await getSalesActions(ownerId).listCustomers.execute({ companyId });
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId, actingAs, effectiveOwnerId}) => {
    const body = await req.json();
    if (!body) return Response.json({ error: 'body es requerido' }, { status: 400 });
    const ownerId = effectiveOwnerId;
    const result = await getSalesActions(ownerId).saveCustomer.execute(body);
    return handleResult(result);
});
