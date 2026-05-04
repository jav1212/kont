// inventory-factory — aggregator for inventory-only use cases.
// Role: backward-compatible facade for existing inventory pages and routes.
// Suppliers + purchase invoices + SENIAT retention exports moved out to
// `purchases/` module — see src/modules/purchases/backend/infra/purchases-factory.ts.
import { getInventoryProductsActions }     from './inventory-products-factory';
import { getInventoryMovementsActions }    from './inventory-movements-factory';
import { getInventoryReportsActions }      from './inventory-reports-factory';
import { getInventoryAdjustmentsActions }  from './inventory-adjustments-factory';

export function getInventoryActions(userId: string) {
    return {
        ...getInventoryProductsActions(userId),
        ...getInventoryMovementsActions(userId),
        ...getInventoryReportsActions(userId),
        ...getInventoryAdjustmentsActions(userId),
    };
}
