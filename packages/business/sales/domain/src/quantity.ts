import { compareDecimal, exactDecimal, type ExactDecimal } from "@kontave/monetary-domain";
import type { UnitOfMeasure } from "@kontave/products-domain";
import { SalesFailure } from "./sales-failure";

export interface SalesQuantity {
  readonly amount: ExactDecimal;
  readonly unit: UnitOfMeasure;
}

/**
 * Creates a strictly positive sales quantity.
 * @param value Exact decimal amount.
 * @param unit Unit of measure.
 * @returns The validated quantity.
 * @throws {SalesFailure} When the amount is not positive.
 */
export function salesQuantity(value: string, unit: UnitOfMeasure): SalesQuantity {
  const amount = exactDecimal(value);
  if (compareDecimal(amount, exactDecimal("0")) <= 0) throw new SalesFailure("SALES_ORDER_INVALID", "Sales quantity must be positive.");
  return { amount, unit };
}
