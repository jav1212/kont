import type { ExactDecimal } from "@kontave/monetary-domain";
import {
  addDecimal,
  compareDecimal,
  exactDecimal,
  negateDecimal,
  subtractDecimal,
} from "@kontave/monetary-domain";
import type { UnitOfMeasure } from "@kontave/products-domain";
import { InventoryFailure } from "./inventory-failure.js";

export interface Quantity {
  readonly amount: ExactDecimal;
  readonly unit: UnitOfMeasure;
}

export function quantity(value: string, unit: UnitOfMeasure): Quantity {
  try {
    return { amount: exactDecimal(value), unit };
  } catch (error) {
    throw new InventoryFailure("INVENTORY_QUANTITY_INVALID", "Inventory quantity is invalid.", { cause: error });
  }
}

export function zeroQuantity(unit: UnitOfMeasure): Quantity {
  return quantity("0", unit);
}

export function addQuantity(left: Quantity, right: Quantity): Quantity {
  requireSameUnit(left, right);
  return { amount: addDecimal(left.amount, right.amount), unit: left.unit };
}

export function subtractQuantity(left: Quantity, right: Quantity): Quantity {
  requireSameUnit(left, right);
  return { amount: subtractDecimal(left.amount, right.amount), unit: left.unit };
}

export function negateQuantity(value: Quantity): Quantity {
  return { amount: negateDecimal(value.amount), unit: value.unit };
}

export function absoluteQuantity(value: Quantity): Quantity {
  return isNegativeQuantity(value) ? negateQuantity(value) : value;
}

export function compareQuantity(left: Quantity, right: Quantity): -1 | 0 | 1 {
  requireSameUnit(left, right);
  return compareDecimal(left.amount, right.amount);
}

export function isZeroQuantity(value: Quantity): boolean {
  return compareDecimal(value.amount, exactDecimal("0")) === 0;
}

export function isPositiveQuantity(value: Quantity): boolean {
  return compareDecimal(value.amount, exactDecimal("0")) > 0;
}

export function isNegativeQuantity(value: Quantity): boolean {
  return compareDecimal(value.amount, exactDecimal("0")) < 0;
}

function requireSameUnit(left: Quantity, right: Quantity): void {
  if (left.unit !== right.unit) {
    throw new InventoryFailure("INVENTORY_QUANTITY_UNIT_MISMATCH", `Cannot combine ${left.unit} and ${right.unit}.`);
  }
}
