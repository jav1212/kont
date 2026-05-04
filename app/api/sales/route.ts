// Sales invoices — list (GET) + create/upsert (POST).
import { getSalesActions } from '@/src/modules/sales/backend/infra/sales-factory';
import { withTenant }      from '@/src/shared/backend/utils/require-tenant';
import { handleResult }    from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getSalesActions(ownerId).listSalesInvoices.execute({ companyId });
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const body = await req.json();
    const { invoice, items } = body ?? {};
    if (!invoice) return Response.json({ error: 'invoice es requerido' }, { status: 400 });
    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getSalesActions(ownerId).saveSalesInvoice.execute({ invoice, items: items ?? [] });
    return handleResult(result);
});
