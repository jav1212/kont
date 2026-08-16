import { compareDecimal, exactDecimal, type ExactDecimal } from "@kontave/monetary-domain";
import type { UnitOfMeasure } from "@kontave/products-domain";
import { SalesFailure } from "./sales-failure";

export interface SalesQuantity {
  readonly amount: ExactDecimal;
  readonly unit: UnitOfMeasure;
}

export function salesQuantity(value: string, unit: UnitOfMeasure): SalesQuantity {
  const amount = exactDecimal(value);
  if (compareDecimal(amount, exactDecimal("0")) <= 0) throw new SalesFailure("SALES_ORDER_INVALID", "Sales quantity must be positive.");
  return { amount, unit };
}
