// API route for updating or deleting a single inventory movement by id.
// Interface adapter — delegates to use cases via factory, no business logic here.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const DELETE = withTenant(async (req, { userId, actingAs }) => {
    const id = req.url.split('/movimientos/')[1]?.split('?')[0];
    if (!id) return Response.json({ error: 'id es requerido' }, { status: 400 });
    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getInventoryActions(ownerId).deleteMovement.execute(id);
    return handleResult(result);
});

export const PATCH = withTenant(async (req, { userId, actingAs }) => {
    const id = req.url.split('/movimientos/')[1]?.split('?')[0];
    if (!id) return Response.json({ error: 'id es requerido' }, { status: 400 });
    const body = await req.json();
    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getInventoryActions(ownerId).updateMovementMeta.execute({
        id,
        date:      body.date,
        reference: body.reference ?? '',
        notes:     body.notes ?? '',
    });
    return handleResult(result);
});
