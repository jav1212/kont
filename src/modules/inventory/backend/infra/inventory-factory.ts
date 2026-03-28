// inventory-factory — aggregator that assembles the full inventory dependency graph.
// Role: backward-compatible facade — spreads all four sub-factories into a single object
//       so existing API route callers (getInventoryActions(userId).someAction) are unaffected.
// Sub-factories (import directly if you only need one domain slice):
//   - inventory-productos-factory   (products, departments)
//   - inventory-movimientos-factory (movements, transformations, kardex)
//   - inventory-proveedores-factory (suppliers, purchase invoices)
//   - inventory-reportes-factory    (period report, ledgers, ISLR, balance)
import { getInventoryProductsActions }  from './inventory-products-factory';
import { getInventoryMovementsActions } from './inventory-movements-factory';
import { getInventorySuppliersActions } from './inventory-suppliers-factory';
import { getInventoryReportsActions }   from './inventory-reports-factory';

export function getInventoryActions(userId: string) {
    return {
        ...getInventoryProductsActions(userId),
        ...getInventoryMovementsActions(userId),
        ...getInventorySuppliersActions(userId),
        ...getInventoryReportsActions(userId),
    };
}
