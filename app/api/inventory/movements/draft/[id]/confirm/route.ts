// API route to confirm a draft group.
// POST /api/inventory/movements/draft/<draftGroupId>/confirm
//   Body: { companyId }
//   → promotes every row in the draft to a confirmed inventory movement
//     and deletes the draft.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const POST = withTenant(async (req, { userId, actingAs }) => {
    // Extract draftGroupId from path: /draft/<id>/confirm
    const path  = new URL(req.url).pathname;
    const match = path.match(/\/draft\/([^/]+)\/confirm$/);
    const draftGroupId = match?.[1];
    if (!draftGroupId) {
        return Response.json({ error: 'draftGroupId es requerido' }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const companyId = body?.companyId as string | undefined;
    if (!companyId) {
        return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    }
    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getInventoryActions(ownerId)
        .confirmMovementDraft.execute({ companyId, draftGroupId });
    return handleResult(result);
});
