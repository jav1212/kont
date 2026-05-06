// API route for reading, updating, or deleting a single purchase invoice by id.
// Interface adapter — delegates to use cases via factory, no business logic here.
import { getPurchasesActions } from '@/src/modules/purchases/backend/infra/purchases-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId, actingAs, effectiveOwnerId}) => {
    // URL pattern: /api/purchases/[id]
    const segments = new URL(req.url).pathname.split('/');
    const id       = segments[segments.length - 1];
    const ownerId  = effectiveOwnerId;
    const result   = await getPurchasesActions(ownerId).getPurchaseInvoice.execute({ invoiceId: id });
    return handleResult(result);
});

export const DELETE = withTenant(async (req, { userId, actingAs, effectiveOwnerId}) => {
    const segments = new URL(req.url).pathname.split('/');
    const id       = segments[segments.length - 1];
    const ownerId  = effectiveOwnerId;
    const result   = await getPurchasesActions(ownerId).deletePurchaseInvoice.execute({ invoiceId: id });
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId, actingAs, effectiveOwnerId}) => {
    const segments = new URL(req.url).pathname.split('/');
    const id       = segments[segments.length - 1];
    const body     = await req.json();
    const { invoice, items } = body;
    if (!invoice || !items) return Response.json({ error: 'invoice e items son requeridos' }, { status: 400 });
    const ownerId = effectiveOwnerId;
    const result = await getPurchasesActions(ownerId).savePurchaseInvoice.execute({
        invoice: { ...invoice, id },
        items,
    });
    return handleResult(result);
});
