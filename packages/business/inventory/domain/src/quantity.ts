import type { ExactDecimal } from "@kontave/monetary-domain";
import {
  addDecimal,
  compareDecimal,
  exactDecimal,
  negateDecimal,
  subtractDecimal,
} from "@kontave/monetary-domain";
import type { UnitOfMeasure } from "@kontave/products-domain";
import { InventoryFailure } from "./inventory-failure";

export interface Quantity {
  readonly amount: ExactDecimal;
  readonly unit: UnitOfMeasure;
}

/**
 * Creates an exact inventory quantity.
 * @param value - Exact decimal quantity text.
 * @param unit - Product unit of measure.
 * @returns The exact quantity.
 * @throws {InventoryFailure} When decimal text is invalid.
 */
export function quantity(value: string, unit: UnitOfMeasure): Quantity {
  try {
    return { amount: exactDecimal(value), unit };
  } catch (error) {
    throw new InventoryFailure("INVENTORY_QUANTITY_INVALID", "Inventory quantity is invalid.", { cause: error });
  }
}

/**
 * @param unit - Product unit of measure.
 * @returns An exact zero quantity in that unit.
 */
export function zeroQuantity(unit: UnitOfMeasure): Quantity {
  return quantity("0", unit);
}

/**
 * @param left - Left quantity.
 * @param right - Right quantity.
 * @returns Their exact sum.
 * @throws {InventoryFailure} When units differ.
 */
export function addQuantity(left: Quantity, right: Quantity): Quantity {
  requireSameUnit(left, right);
  return { amount: addDecimal(left.amount, right.amount), unit: left.unit };
}

/**
 * @param left - Minuend quantity.
 * @param right - Subtrahend quantity.
 * @returns Their exact difference.
 * @throws {InventoryFailure} When units differ.
 */
export function subtractQuantity(left: Quantity, right: Quantity): Quantity {
  requireSameUnit(left, right);
  return { amount: subtractDecimal(left.amount, right.amount), unit: left.unit };
}

/**
 * @param value - Quantity to negate.
 * @returns Its additive inverse in the same unit.
 */
export function negateQuantity(value: Quantity): Quantity {
  return { amount: negateDecimal(value.amount), unit: value.unit };
}

/**
 * @param value - Quantity to normalize.
 * @returns Its non-negative magnitude.
 */
export function absoluteQuantity(value: Quantity): Quantity {
  return isNegativeQuantity(value) ? negateQuantity(value) : value;
}

/**
 * @param left - Left quantity.
 * @param right - Right quantity.
 * @returns `-1`, `0` or `1` according to exact ordering.
 * @throws {InventoryFailure} When units differ.
 */
export function compareQuantity(left: Quantity, right: Quantity): -1 | 0 | 1 {
  requireSameUnit(left, right);
  return compareDecimal(left.amount, right.amount);
}

/** @param value - Quantity to test. @returns Whether its amount is zero. */
export function isZeroQuantity(value: Quantity): boolean {
  return compareDecimal(value.amount, exactDecimal("0")) === 0;
}

/** @param value - Quantity to test. @returns Whether its amount is positive. */
export function isPositiveQuantity(value: Quantity): boolean {
  return compareDecimal(value.amount, exactDecimal("0")) > 0;
}

/** @param value - Quantity to test. @returns Whether its amount is negative. */
export function isNegativeQuantity(value: Quantity): boolean {
  return compareDecimal(value.amount, exactDecimal("0")) < 0;
}

function requireSameUnit(left: Quantity, right: Quantity): void {
  if (left.unit !== right.unit) {
    throw new InventoryFailure("INVENTORY_QUANTITY_UNIT_MISMATCH", `Cannot combine ${left.unit} and ${right.unit}.`);
  }
}
