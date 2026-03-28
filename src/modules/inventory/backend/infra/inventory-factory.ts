// inventory-factory — aggregator that assembles the full inventory dependency graph.
// Role: backward-compatible facade — spreads all four sub-factories into a single object
//       so existing API route callers (getInventoryActions(userId).someAction) are unaffected.
// Sub-factories (import directly if you only need one domain slice):
//   - inventory-productos-factory   (products, departments)
//   - inventory-movimientos-factory (movements, transformations, kardex)
//   - inventory-proveedores-factory (suppliers, purchase invoices)
//   - inventory-reportes-factory    (period report, books, ISLR, saldo)
import { getInventoryProductosActions }   from './inventory-productos-factory';
import { getInventoryMovimientosActions } from './inventory-movimientos-factory';
import { getInventoryProveedoresActions } from './inventory-proveedores-factory';
import { getInventoryReportesActions }    from './inventory-reportes-factory';

export function getInventoryActions(userId: string) {
    return {
        ...getInventoryProductosActions(userId),
        ...getInventoryMovimientosActions(userId),
        ...getInventoryProveedoresActions(userId),
        ...getInventoryReportesActions(userId),
    };
}
