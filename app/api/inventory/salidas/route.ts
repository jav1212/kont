import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import type { Movimiento }     from '@/src/modules/inventory/backend/domain/movimiento';

interface SalidaItem {
    productoId: string;
    cantidad: number;
    existenciaActual?: number;
}

interface SalidaBody {
    empresaId: string;
    fecha: string;
    referencia?: string;
    items: SalidaItem[];
}

export const POST = withTenant(async (req, { userId }) => {
    const body: SalidaBody = await req.json();
    const { empresaId, fecha, referencia, items } = body;

    if (!empresaId)     return Response.json({ error: 'empresaId es requerido' }, { status: 400 });
    if (!fecha)         return Response.json({ error: 'fecha es requerida' }, { status: 400 });
    if (!items?.length) return Response.json({ error: 'Se requiere al menos un producto' }, { status: 400 });

    const actions = getInventoryActions(userId);
    const periodo = fecha.slice(0, 7);
    const saved: Movimiento[] = [];

    for (const item of items) {
        const mov: Movimiento = {
            empresaId,
            productoId:       item.productoId,
            tipo:             'salida',
            fecha,
            periodo,
            cantidad:         item.cantidad,
            costoUnitario:    0, // RPC uses costo_promedio from product
            costoTotal:       0,
            saldoCantidad:    0,
            referencia:       referencia ?? '',
            notas:            '',
            existenciaActual: item.existenciaActual,
        };

        const result = await actions.saveMovimiento.execute(mov);
        if (result.isFailure) {
            return Response.json({ error: result.getError() }, { status: 400 });
        }
        saved.push(result.getValue());
    }

    return Response.json({ data: saved });
});
