import { compareDecimal, exactDecimal, type ExactDecimal } from "@kontave/monetary-domain";
import type { UnitOfMeasure } from "@kontave/products-domain";
import { PurchasingFailure } from "./purchasing-failure";

export interface PurchaseQuantity {
  readonly amount: ExactDecimal;
  readonly unit: UnitOfMeasure;
}

/**
 * Creates a strictly positive purchasing quantity.
 * @param value Exact decimal amount.
 * @param unit Unit of measure.
 * @returns The validated quantity.
 * @throws {PurchasingFailure} When the amount is not positive.
 */
export function purchaseQuantity(value: string, unit: UnitOfMeasure): PurchaseQuantity {
  const amount = exactDecimal(value);
  if (compareDecimal(amount, exactDecimal("0")) <= 0) throw new PurchasingFailure("PURCHASE_ORDER_INVALID", "Purchase quantity must be positive.");
  return { amount, unit };
}

/**
 * Compares the units of two purchasing quantities.
 * @param left First quantity.
 * @param right Second quantity.
 * @returns Whether both quantities use the same unit.
 */
export function sameUnit(left: PurchaseQuantity, right: PurchaseQuantity): boolean {
  return left.unit === right.unit;
}
