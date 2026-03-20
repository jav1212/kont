import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import type { Movimiento }     from '@/src/modules/inventory/backend/domain/movimiento';

interface VentaItem {
    productoId: string;
    cantidad: number;
    precioVentaUnitario: number;
    ivaTipo: 'general' | 'exento';
    existenciaActual?: number;
}

interface NotaDespachoBody {
    empresaId: string;
    numeroFactura: string;
    clienteRif: string;
    clienteNombre: string;
    fecha: string;
    items: VentaItem[];
}

export const POST = withTenant(async (req, { userId }) => {
    const body: NotaDespachoBody = await req.json();
    const { empresaId, numeroFactura, clienteRif, clienteNombre, fecha, items } = body;

    if (!empresaId)      return Response.json({ error: 'empresaId es requerido' }, { status: 400 });
    if (!numeroFactura)  return Response.json({ error: 'numeroFactura es requerido' }, { status: 400 });
    if (!clienteNombre)  return Response.json({ error: 'clienteNombre es requerido' }, { status: 400 });
    if (!fecha)          return Response.json({ error: 'fecha es requerida' }, { status: 400 });
    if (!items?.length)  return Response.json({ error: 'Se requiere al menos un producto' }, { status: 400 });

    const actions = getInventoryActions(userId);
    const periodo = fecha.slice(0, 7);
    const saved: Movimiento[] = [];

    for (const item of items) {
        const ivaVentaMonto = item.ivaTipo === 'general'
            ? Math.round(item.precioVentaUnitario * item.cantidad * 0.16 * 100) / 100
            : 0;

        const mov: Movimiento = {
            empresaId,
            productoId:           item.productoId,
            tipo:                 'salida_venta',
            fecha,
            periodo,
            cantidad:             item.cantidad,
            costoUnitario:        0, // RPC will use costo_promedio from product
            costoTotal:           0,
            saldoCantidad:        0,
            referencia:           numeroFactura,
            notas:                '',
            existenciaActual:     item.existenciaActual,
            numeroFacturaVenta:   numeroFactura,
            clienteRif:           clienteRif || null,
            clienteNombre:        clienteNombre,
            precioVentaUnitario:  item.precioVentaUnitario,
            ivaVentaMonto:        ivaVentaMonto > 0 ? ivaVentaMonto : null,
        };

        const result = await actions.saveMovimiento.execute(mov);
        if (result.isFailure) {
            return Response.json({ error: result.getError() }, { status: 400 });
        }
        saved.push(result.getValue());
    }

    return Response.json({ data: saved });
});
