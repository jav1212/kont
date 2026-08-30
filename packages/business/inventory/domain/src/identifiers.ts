import { InventoryFailure } from "./inventory-failure";

declare const inventoryLocationIdBrand: unique symbol;
declare const inventoryOperationIdBrand: unique symbol;
declare const stockEffectIdBrand: unique symbol;
declare const stockLotIdBrand: unique symbol;
declare const stockCountIdBrand: unique symbol;
declare const stockCountLineIdBrand: unique symbol;

/** Stable identifier for an inventory location. */
export type InventoryLocationId = string & { readonly [inventoryLocationIdBrand]: true };
/** Stable identifier for an inventory operation. */
export type InventoryOperationId = string & { readonly [inventoryOperationIdBrand]: true };
/** Stable identifier for one stock effect. */
export type StockEffectId = string & { readonly [stockEffectIdBrand]: true };
/** Stable identifier for a stock lot. */
export type StockLotId = string & { readonly [stockLotIdBrand]: true };
/** Stable identifier for a physical stock count. */
export type StockCountId = string & { readonly [stockCountIdBrand]: true };
/** Stable identifier for a physical stock-count line. */
export type StockCountLineId = string & { readonly [stockCountLineIdBrand]: true };

/**
 * @param value - Untrusted inventory-location identifier.
 * @returns The normalized branded identifier.
 * @throws {InventoryFailure} When invalid.
 */
export function inventoryLocationId(value: string): InventoryLocationId {
  return identifier(value, "inventory location") as InventoryLocationId;
}

/**
 * @param value - Untrusted inventory-operation identifier.
 * @returns The normalized branded identifier.
 * @throws {InventoryFailure} When invalid.
 */
export function inventoryOperationId(value: string): InventoryOperationId {
  return identifier(value, "inventory operation") as InventoryOperationId;
}

/**
 * @param value - Untrusted stock-effect identifier.
 * @returns The normalized branded identifier.
 * @throws {InventoryFailure} When invalid.
 */
export function stockEffectId(value: string): StockEffectId {
  return identifier(value, "stock effect") as StockEffectId;
}

/**
 * @param value - Untrusted stock-lot identifier.
 * @returns The normalized branded identifier.
 * @throws {InventoryFailure} When invalid.
 */
export function stockLotId(value: string): StockLotId {
  return identifier(value, "stock lot") as StockLotId;
}

/**
 * @param value - Untrusted stock-count identifier.
 * @returns The normalized branded identifier.
 * @throws {InventoryFailure} When invalid.
 */
export function stockCountId(value: string): StockCountId {
  return identifier(value, "stock count") as StockCountId;
}

/**
 * @param value - Untrusted stock-count-line identifier.
 * @returns The normalized branded identifier.
 * @throws {InventoryFailure} When invalid.
 */
export function stockCountLineId(value: string): StockCountLineId {
  return identifier(value, "stock count line") as StockCountLineId;
}

function identifier(value: string, kind: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new InventoryFailure("INVENTORY_IDENTIFIER_INVALID", `The ${kind} identifier is invalid.`);
  }
  return normalized;
}
