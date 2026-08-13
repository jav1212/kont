import { companyId } from "@kontave/companies-domain";
import { currency } from "@kontave/monetary-domain";
import { productId, UnitOfMeasure } from "@kontave/products-domain";
import {
  InventoryProfile,
  emptyValuationPosition,
  inventoryLocationId,
  quantity,
} from "@kontave/inventory-domain";

export const INVENTORY_COMPANY_ID = companyId("inventory-company-1");
export const INVENTORY_PRODUCT_ID = productId("inventory-product-1");
export const MAIN_LOCATION_ID = inventoryLocationId("main-location");
export const VES = currency("VES", 2);

export function inventoryProfileFixture(): InventoryProfile {
  return new InventoryProfile({
    companyId: INVENTORY_COMPANY_ID,
    productId: INVENTORY_PRODUCT_ID,
    trackingPolicy: { method: "none" },
    negativeStockPolicy: { mode: "forbidden" },
    valuationPolicy: { method: "weighted_average" },
    status: "active",
    version: 1,
  });
}

export function emptyValuationFixture() {
  return emptyValuationPosition({
    companyId: INVENTORY_COMPANY_ID,
    productId: INVENTORY_PRODUCT_ID,
    locationId: MAIN_LOCATION_ID,
    lotId: null,
    quantity: quantity("0", UnitOfMeasure.Each),
    functionalCurrency: VES,
  });
}
