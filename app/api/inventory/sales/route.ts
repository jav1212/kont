// API route for inventory outbound movements (salidas).
// Creates one Movement per item in the request, using the saveMovement use case.
// Interface adapter — business loop here is intentional: each item becomes an independent movement record.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import type { Movement }       from '@/src/modules/inventory/backend/domain/movement';

interface OutboundItem {
    productId: string;
    quantity: number;
    currentStock?: number;
}

interface OutboundBody {
    companyId: string;
    date: string;
    reference?: string;
    items: OutboundItem[];
}

export const POST = withTenant(async (req, { userId }) => {
    const body: OutboundBody = await req.json();
    const { companyId, date, reference, items } = body;

    if (!companyId)     return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    if (!date)          return Response.json({ error: 'date es requerida' }, { status: 400 });
    if (!items?.length) return Response.json({ error: 'Se requiere al menos un producto' }, { status: 400 });

    const actions = getInventoryActions(userId);
    const period  = date.slice(0, 7);
    const saved: Movement[] = [];

    for (const item of items) {
        const movement: Movement = {
            companyId,
            productId:    item.productId,
            type:         'salida',
            date,
            period,
            quantity:     item.quantity,
            unitCost:     0, // RPC resolves average cost from product record
            totalCost:    0,
            balanceQuantity: 0,
            reference:    reference ?? '',
            notes:        '',
            currentStock: item.currentStock,
        };

        const result = await actions.saveMovement.execute(movement);
        if (result.isFailure) {
            return Response.json({ error: result.getError() }, { status: 400 });
        }
        saved.push(result.getValue());
    }

    return Response.json({ data: saved });
});
