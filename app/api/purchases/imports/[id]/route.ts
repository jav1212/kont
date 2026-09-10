import { getPurchasesActions } from '@/src/modules/purchases/backend/infra/purchases-factory';
import { requirePermission, withTenant } from '@/src/shared/backend/utils/require-tenant';
import { handleResult } from '@/src/shared/backend/utils/handle-result';

/** Retrieves a staged CSV import scoped to the supplied company. */
export const GET = withTenant(async (req, tenant) => {
    await requirePermission(tenant, 'purchases.read', { req });
    const companyId = new URL(req.url).searchParams.get('companyId');
    const id = new URL(req.url).pathname.split('/').at(-1) ?? '';
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    return handleResult(await getPurchasesActions(tenant.tenantId).getPurchaseCsvImport.execute({ id, companyId }), 200, req);
});
