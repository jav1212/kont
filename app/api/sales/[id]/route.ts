// Sales invoice — get / update / delete.
import { getSalesActions } from '@/src/modules/sales/backend/infra/sales-factory';
import { withTenant }      from '@/src/shared/backend/utils/require-tenant';
import { handleResult }    from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId, actingAs, effectiveOwnerId}) => {
    const id      = new URL(req.url).pathname.split('/').pop()!;
    const ownerId = effectiveOwnerId;
    const result  = await getSalesActions(ownerId).getSalesInvoice.execute({ invoiceId: id });
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId, actingAs, effectiveOwnerId}) => {
    const body = await req.json();
    const { invoice, items } = body ?? {};
    if (!invoice) return Response.json({ error: 'invoice es requerido' }, { status: 400 });
    const id = new URL(req.url).pathname.split('/').pop()!;
    const ownerId = effectiveOwnerId;
    const result = await getSalesActions(ownerId).saveSalesInvoice.execute({
        invoice: { ...invoice, id },
        items: items ?? [],
    });
    return handleResult(result);
});

export const DELETE = withTenant(async (req, { userId, actingAs, effectiveOwnerId}) => {
    const id      = new URL(req.url).pathname.split('/').pop()!;
    const ownerId = effectiveOwnerId;
    const result  = await getSalesActions(ownerId).deleteSalesInvoice.execute({ invoiceId: id });
    return handleResult(result);
});
