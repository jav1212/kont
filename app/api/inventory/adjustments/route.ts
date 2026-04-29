// API route — persiste un ajuste directo de existencia.
// Recibe lista de { productId, newCurrentStock } y actualiza cada producto
// vía SaveStockAdjustmentUseCase. NO crea movimientos en el kardex.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import type { SaveStockAdjustmentInput } from '@/src/modules/inventory/backend/app/save-stock-adjustment.use-case';

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const body = await req.json() as Partial<SaveStockAdjustmentInput>;
    const { companyId, items } = body;

    if (!companyId)                              return Response.json({ error: 'companyId es requerido' },           { status: 400 });
    if (!Array.isArray(items) || items.length === 0)
                                                  return Response.json({ error: 'items debe ser un array no vacío' }, { status: 400 });

    for (const item of items) {
        if (!item || typeof item.productId !== 'string' || !item.productId) {
            return Response.json({ error: 'Cada item requiere productId' }, { status: 400 });
        }
        if (typeof item.newCurrentStock !== 'number' || !Number.isFinite(item.newCurrentStock) || item.newCurrentStock < 0) {
            return Response.json({ error: 'Cada item requiere newCurrentStock numérico ≥ 0' }, { status: 400 });
        }
    }

    const ownerId = actingAs?.ownerId ?? userId;
    const actions = getInventoryActions(ownerId);

    const result = await actions.saveStockAdjustment.execute({ companyId, items });

    if (result.isFailure) return Response.json({ error: result.getError() }, { status: 400 });
    return Response.json({ data: result.getValue() });
});
