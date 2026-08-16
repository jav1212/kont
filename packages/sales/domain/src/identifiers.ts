import { SalesFailure } from "./sales-failure";

declare const customerIdBrand: unique symbol;
declare const salesOrderIdBrand: unique symbol;
declare const salesOrderLineIdBrand: unique symbol;
declare const goodsDispatchIdBrand: unique symbol;
declare const goodsDispatchLineIdBrand: unique symbol;
declare const customerReturnIdBrand: unique symbol;
declare const customerReturnLineIdBrand: unique symbol;
declare const customerInvoiceMatchIdBrand: unique symbol;

export type CustomerId = string & { readonly [customerIdBrand]: true };
export type SalesOrderId = string & { readonly [salesOrderIdBrand]: true };
export type SalesOrderLineId = string & { readonly [salesOrderLineIdBrand]: true };
export type GoodsDispatchId = string & { readonly [goodsDispatchIdBrand]: true };
export type GoodsDispatchLineId = string & { readonly [goodsDispatchLineIdBrand]: true };
export type CustomerReturnId = string & { readonly [customerReturnIdBrand]: true };
export type CustomerReturnLineId = string & { readonly [customerReturnLineIdBrand]: true };
export type CustomerInvoiceMatchId = string & { readonly [customerInvoiceMatchIdBrand]: true };

export const customerId = (value: string): CustomerId => id(value, "customer") as CustomerId;
export const salesOrderId = (value: string): SalesOrderId => id(value, "order") as SalesOrderId;
export const salesOrderLineId = (value: string): SalesOrderLineId => id(value, "order line") as SalesOrderLineId;
export const goodsDispatchId = (value: string): GoodsDispatchId => id(value, "dispatch") as GoodsDispatchId;
export const goodsDispatchLineId = (value: string): GoodsDispatchLineId => id(value, "dispatch line") as GoodsDispatchLineId;
export const customerReturnId = (value: string): CustomerReturnId => id(value, "return") as CustomerReturnId;
export const customerReturnLineId = (value: string): CustomerReturnLineId => id(value, "return line") as CustomerReturnLineId;
export const customerInvoiceMatchId = (value: string): CustomerInvoiceMatchId => id(value, "invoice match") as CustomerInvoiceMatchId;

function id(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) throw new SalesFailure("SALES_IDENTIFIER_INVALID", `Sales ${name} identifier is invalid.`);
  return normalized;
}
