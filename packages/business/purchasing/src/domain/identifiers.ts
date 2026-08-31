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

/** @param value Raw identifier. @returns A validated supplier identifier. @throws {PurchasingFailure} When invalid. */
export const supplierId = (value: string): SupplierId => id(value, "supplier") as SupplierId;
/** @param value Raw identifier. @returns A validated purchase-order identifier. @throws {PurchasingFailure} When invalid. */
export const purchaseOrderId = (value: string): PurchaseOrderId =>
  id(value, "order") as PurchaseOrderId;
/** @param value Raw identifier. @returns A validated order-line identifier. @throws {PurchasingFailure} When invalid. */
export const purchaseOrderLineId = (value: string): PurchaseOrderLineId =>
  id(value, "order line") as PurchaseOrderLineId;
/** @param value Raw identifier. @returns A validated receipt identifier. @throws {PurchasingFailure} When invalid. */
export const goodsReceiptId = (value: string): GoodsReceiptId =>
  id(value, "receipt") as GoodsReceiptId;
/** @param value Raw identifier. @returns A validated receipt-line identifier. @throws {PurchasingFailure} When invalid. */
export const goodsReceiptLineId = (value: string): GoodsReceiptLineId =>
  id(value, "receipt line") as GoodsReceiptLineId;
/** @param value Raw identifier. @returns A validated purchase-return identifier. @throws {PurchasingFailure} When invalid. */
export const purchaseReturnId = (value: string): PurchaseReturnId =>
  id(value, "return") as PurchaseReturnId;
/** @param value Raw identifier. @returns A validated return-line identifier. @throws {PurchasingFailure} When invalid. */
export const purchaseReturnLineId = (value: string): PurchaseReturnLineId =>
  id(value, "return line") as PurchaseReturnLineId;
/** @param value Raw identifier. @returns A validated invoice-match identifier. @throws {PurchasingFailure} When invalid. */
export const supplierInvoiceMatchId = (value: string): SupplierInvoiceMatchId =>
  id(value, "invoice match") as SupplierInvoiceMatchId;
/** @param value Raw identifier. @returns A validated purchasing-document identifier. @throws {PurchasingFailure} When invalid. */
export const purchasingDocumentId = (value: string): PurchasingDocumentId =>
  id(value, "document") as PurchasingDocumentId;

function id(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new PurchasingFailure(
      "PURCHASING_IDENTIFIER_INVALID",
      `Purchase ${name} identifier is invalid.`,
    );
  }
  return normalized;
}
