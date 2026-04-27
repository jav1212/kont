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
    // Optional sale price set by the random sales generator. When present, the
    // movement is persisted with precio_venta_unitario so the period report can
    // reflect ganancia/pérdida via SUM(precio_venta_unitario × cantidad) for
    // tipo='salida'. When omitted the movement remains valued at costo_total
    // (legacy behavior).
    precioVentaUnitario?: number;
    // Optional override for the movement date. When omitted falls back to the
    // outer body.date. Used by the generator to spread sales across the period.
    date?: string;
    // Optional movement type — defaults to 'salida'. The random sales generator
    // sends 'autoconsumo' for the carve-out lines so the same payload persists
    // both 'salida' and 'autoconsumo' movements in a single request.
    type?: 'salida' | 'autoconsumo';
}

interface OutboundBody {
    companyId: string;
    date: string;
    reference?: string;
    items: OutboundItem[];
}

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const body: OutboundBody = await req.json();
    const { companyId, date, reference, items } = body;

    if (!companyId)     return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    if (!date)          return Response.json({ error: 'date es requerida' }, { status: 400 });
    if (!items?.length) return Response.json({ error: 'Se requiere al menos un producto' }, { status: 400 });

    const ownerId = actingAs?.ownerId ?? userId;
    const actions = getInventoryActions(ownerId);
    const saved: Movement[] = [];

    for (const item of items) {
        const itemDate = item.date ?? date;
        const itemType = item.type === 'autoconsumo' ? 'autoconsumo' : 'salida';
        const movement: Movement = {
            companyId,
            productId:    item.productId,
            type:         itemType,
            date:         itemDate,
            period:       itemDate.slice(0, 7),
            quantity:     item.quantity,
            unitCost:     0, // RPC resolves average cost from product record
            totalCost:    0,
            balanceQuantity: 0,
            reference:    reference ?? '',
            notes:        '',
            currentStock: item.currentStock,
            precioVentaUnitario:
                typeof item.precioVentaUnitario === 'number' && Number.isFinite(item.precioVentaUnitario)
                    ? item.precioVentaUnitario
                    : null,
        };

        const result = await actions.saveMovement.execute(movement);
        if (result.isFailure) {
            return Response.json({ error: result.getError() }, { status: 400 });
        }
        saved.push(result.getValue());
    }

    return Response.json({ data: saved });
});
