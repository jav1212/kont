// API route for inventory movement drafts.
// Interface adapter — delegates to use cases via factory.
//
// GET    ?companyId=&kind=         → most-recently updated draft summary
// GET    ?companyId=&draftGroupId= → full draft group (meta + items)
// POST                              → save (UPSERT) a draft group
// DELETE ?companyId=&draftGroupId= → discard a draft group
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';
import type { MovementDraftKind } from '@/src/modules/inventory/backend/domain/movement-draft';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const url            = new URL(req.url);
    const companyId      = url.searchParams.get('companyId');
    const kind           = url.searchParams.get('kind') as MovementDraftKind | null;
    const draftGroupId   = url.searchParams.get('draftGroupId');

    if (!companyId) {
        return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    }
    const ownerId = actingAs?.ownerId ?? userId;
    const actions = getInventoryActions(ownerId);

    if (draftGroupId) {
        const result = await actions.getMovementDraft.execute({ companyId, draftGroupId });
        return handleResult(result);
    }
    if (!kind) {
        return Response.json({ error: 'kind es requerido' }, { status: 400 });
    }
    const result = await actions.listLatestMovementDraft.execute({ companyId, kind });
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const body = await req.json();
    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getInventoryActions(ownerId).saveMovementDraft.execute(body);
    return handleResult(result);
});

export const DELETE = withTenant(async (req, { userId, actingAs }) => {
    const url            = new URL(req.url);
    const companyId      = url.searchParams.get('companyId');
    const draftGroupId   = url.searchParams.get('draftGroupId');
    if (!companyId || !draftGroupId) {
        return Response.json({ error: 'companyId y draftGroupId son requeridos' }, { status: 400 });
    }
    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getInventoryActions(ownerId)
        .discardMovementDraft.execute({ companyId, draftGroupId });
    return handleResult(result);
});
