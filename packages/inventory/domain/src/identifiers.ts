import { InventoryFailure } from "./inventory-failure";

declare const inventoryLocationIdBrand: unique symbol;
declare const inventoryOperationIdBrand: unique symbol;
declare const stockEffectIdBrand: unique symbol;
declare const stockLotIdBrand: unique symbol;
declare const stockCountIdBrand: unique symbol;
declare const stockCountLineIdBrand: unique symbol;

export type InventoryLocationId = string & { readonly [inventoryLocationIdBrand]: true };
export type InventoryOperationId = string & { readonly [inventoryOperationIdBrand]: true };
export type StockEffectId = string & { readonly [stockEffectIdBrand]: true };
export type StockLotId = string & { readonly [stockLotIdBrand]: true };
export type StockCountId = string & { readonly [stockCountIdBrand]: true };
export type StockCountLineId = string & { readonly [stockCountLineIdBrand]: true };

export const inventoryLocationId = (value: string): InventoryLocationId => identifier(value, "inventory location") as InventoryLocationId;
export const inventoryOperationId = (value: string): InventoryOperationId => identifier(value, "inventory operation") as InventoryOperationId;
export const stockEffectId = (value: string): StockEffectId => identifier(value, "stock effect") as StockEffectId;
export const stockLotId = (value: string): StockLotId => identifier(value, "stock lot") as StockLotId;
export const stockCountId = (value: string): StockCountId => identifier(value, "stock count") as StockCountId;
export const stockCountLineId = (value: string): StockCountLineId => identifier(value, "stock count line") as StockCountLineId;

function identifier(value: string, kind: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new InventoryFailure("INVENTORY_IDENTIFIER_INVALID", `The ${kind} identifier is invalid.`);
  }
  return normalized;
}
