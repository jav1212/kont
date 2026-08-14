import { companyId } from "@kontave/companies-domain";
import { currency, moneyFromDecimal } from "@kontave/monetary-domain";
import { productId, UnitOfMeasure } from "@kontave/products-domain";
import {
  GoodsReceipt,
  PurchaseOrder,
  Supplier,
  goodsReceiptId,
  goodsReceiptLineId,
  purchaseDate,
  purchaseOrderId,
  purchaseOrderLineId,
  purchaseQuantity,
  supplierId,
} from "@kontave/purchasing-domain";

export const PURCHASING_COMPANY_ID = companyId("purchasing-company-1");
export const PURCHASING_SUPPLIER_ID = supplierId("purchasing-supplier-1");
export const PURCHASING_PRODUCT_ID = productId("purchasing-product-1");
export const PURCHASING_ORDER_ID = purchaseOrderId("purchasing-order-1");
export const PURCHASING_ORDER_LINE_ID = purchaseOrderLineId("purchasing-order-line-1");
export const PURCHASING_RECEIPT_ID = goodsReceiptId("purchasing-receipt-1");
export const PURCHASING_VES = currency("VES", 2);

export function supplierFixture(): Supplier {
  return new Supplier({ id: PURCHASING_SUPPLIER_ID, companyId: PURCHASING_COMPANY_ID, legalName: "Supplier C.A.", tradeName: null, taxIdentifier: "J-12345678-9", status: "active", version: 1 });
}
export function approvedPurchaseOrderFixture(): PurchaseOrder {
  return new PurchaseOrder({
    id: PURCHASING_ORDER_ID, companyId: PURCHASING_COMPANY_ID, supplierId: PURCHASING_SUPPLIER_ID, orderDate: purchaseDate("2026-08-13"), transactionCurrency: PURCHASING_VES, status: "approved", version: 1,
    lines: [{ id: PURCHASING_ORDER_LINE_ID, kind: "stock", productId: PURCHASING_PRODUCT_ID, description: "Canonical purchase item", orderedQuantity: purchaseQuantity("10", UnitOfMeasure.Each), unitPrice: moneyFromDecimal("5", PURCHASING_VES), grossAmount: moneyFromDecimal("50", PURCHASING_VES), adjustments: [], netAmount: moneyFromDecimal("50", PURCHASING_VES) }],
  });
}
export function goodsReceiptFixture(quantity = "4"): GoodsReceipt {
  return new GoodsReceipt({
    id: PURCHASING_RECEIPT_ID, companyId: PURCHASING_COMPANY_ID, supplierId: PURCHASING_SUPPLIER_ID, orderId: PURCHASING_ORDER_ID, receiptDate: purchaseDate("2026-08-13"), status: "draft", confirmedAt: null, reversedAt: null, version: 0,
    lines: [{ id: goodsReceiptLineId("purchasing-receipt-line-1"), orderLineId: PURCHASING_ORDER_LINE_ID, productId: PURCHASING_PRODUCT_ID, quantity: purchaseQuantity(quantity, UnitOfMeasure.Each), inventoryLocationReference: "main", lotReference: null, acquisitionValue: { amount: moneyFromDecimal("20", PURCHASING_VES), status: "provisional", basis: "Approved order" } }],
  });
}
