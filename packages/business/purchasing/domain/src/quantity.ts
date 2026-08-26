import { compareDecimal, exactDecimal, type ExactDecimal } from "@kontave/monetary-domain";
import type { UnitOfMeasure } from "@kontave/products-domain";
import { PurchasingFailure } from "./purchasing-failure";

export interface PurchaseQuantity {
  readonly amount: ExactDecimal;
  readonly unit: UnitOfMeasure;
}

export function purchaseQuantity(value: string, unit: UnitOfMeasure): PurchaseQuantity {
  const amount = exactDecimal(value);
  if (compareDecimal(amount, exactDecimal("0")) <= 0) throw new PurchasingFailure("PURCHASE_ORDER_INVALID", "Purchase quantity must be positive.");
  return { amount, unit };
}

export function sameUnit(left: PurchaseQuantity, right: PurchaseQuantity): boolean {
  return left.unit === right.unit;
}
