import { PurchasingFailure } from "./purchasing-failure";

declare const supplierIdBrand: unique symbol;
declare const purchaseOrderIdBrand: unique symbol;
declare const purchaseOrderLineIdBrand: unique symbol;
declare const goodsReceiptIdBrand: unique symbol;
declare const goodsReceiptLineIdBrand: unique symbol;
declare const purchaseReturnIdBrand: unique symbol;
declare const purchaseReturnLineIdBrand: unique symbol;
declare const supplierInvoiceMatchIdBrand: unique symbol;
declare const purchasingDocumentIdBrand: unique symbol;

export type SupplierId = string & { readonly [supplierIdBrand]: true };
export type PurchaseOrderId = string & { readonly [purchaseOrderIdBrand]: true };
export type PurchaseOrderLineId = string & { readonly [purchaseOrderLineIdBrand]: true };
export type GoodsReceiptId = string & { readonly [goodsReceiptIdBrand]: true };
export type GoodsReceiptLineId = string & { readonly [goodsReceiptLineIdBrand]: true };
export type PurchaseReturnId = string & { readonly [purchaseReturnIdBrand]: true };
export type PurchaseReturnLineId = string & { readonly [purchaseReturnLineIdBrand]: true };
export type SupplierInvoiceMatchId = string & { readonly [supplierInvoiceMatchIdBrand]: true };
export type PurchasingDocumentId = string & { readonly [purchasingDocumentIdBrand]: true };

export const supplierId = (value: string): SupplierId => id(value, "supplier") as SupplierId;
export const purchaseOrderId = (value: string): PurchaseOrderId => id(value, "order") as PurchaseOrderId;
export const purchaseOrderLineId = (value: string): PurchaseOrderLineId => id(value, "order line") as PurchaseOrderLineId;
export const goodsReceiptId = (value: string): GoodsReceiptId => id(value, "receipt") as GoodsReceiptId;
export const goodsReceiptLineId = (value: string): GoodsReceiptLineId => id(value, "receipt line") as GoodsReceiptLineId;
export const purchaseReturnId = (value: string): PurchaseReturnId => id(value, "return") as PurchaseReturnId;
export const purchaseReturnLineId = (value: string): PurchaseReturnLineId => id(value, "return line") as PurchaseReturnLineId;
export const supplierInvoiceMatchId = (value: string): SupplierInvoiceMatchId => id(value, "invoice match") as SupplierInvoiceMatchId;
export const purchasingDocumentId = (value: string): PurchasingDocumentId => id(value, "document") as PurchasingDocumentId;

function id(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) throw new PurchasingFailure("PURCHASING_IDENTIFIER_INVALID", `Purchase ${name} identifier is invalid.`);
  return normalized;
}
