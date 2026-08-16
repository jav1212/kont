import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies-domain";
import { currency, moneyFromDecimal } from "@kontave/monetary-domain";
import { productId, UnitOfMeasure } from "@kontave/products-domain";
import {
  GoodsReceipt,
  PurchaseOrder,
  PurchaseReturn,
  PurchasingFailure,
  goodsReceiptId,
  goodsReceiptLineId,
  purchaseDate,
  purchaseOrderId,
  purchaseOrderLineId,
  purchaseQuantity,
  purchaseReturnId,
  purchaseReturnLineId,
  supplierId,
} from "../src/index";

const VES = currency("VES", 2);
const company = companyId("company-1");
const supplier = supplierId("supplier-1");
const product = productId("product-1");
const orderLine = purchaseOrderLineId("order-line-1");

test("purchase order separates stock and non-stock concepts and has an explicit approval lifecycle", () => {
  const order = new PurchaseOrder({
    id: purchaseOrderId("order-1"), companyId: company, supplierId: supplier, orderDate: purchaseDate("2026-08-13"), transactionCurrency: VES, status: "draft", version: 0,
    lines: [
      { id: orderLine, kind: "stock", productId: product, description: "Stock item", orderedQuantity: purchaseQuantity("10", UnitOfMeasure.Each), unitPrice: moneyFromDecimal("5", VES), grossAmount: moneyFromDecimal("50", VES), adjustments: [], netAmount: moneyFromDecimal("50", VES) },
      { id: purchaseOrderLineId("service-line"), kind: "service", productId: null, description: "Freight", orderedQuantity: purchaseQuantity("1", UnitOfMeasure.Each), unitPrice: moneyFromDecimal("10", VES), grossAmount: moneyFromDecimal("10", VES), adjustments: [], netAmount: moneyFromDecimal("10", VES) },
    ],
  });
  assert.equal(order.approve().status, "approved");
  assert.throws(() => order.close(), (error: unknown) => error instanceof PurchasingFailure && error.code === "PURCHASE_ORDER_TRANSITION_INVALID");
});

test("confirming a goods receipt emits a stable idempotency key and preserves provisional cost", () => {
  const receipt = receiptFixture();
  const confirmed = receipt.confirm("2026-08-13T10:00:00-04:00");
  assert.equal(confirmed.receipt.status, "confirmed");
  assert.equal(confirmed.event.operationKey, "purchase-receipt:receipt-1:v1");
  assert.equal(confirmed.event.lines[0]?.acquisitionValue.status, "provisional");
  assert.throws(() => confirmed.receipt.confirm("2026-08-13T11:00:00-04:00"),
    (error: unknown) => error instanceof PurchasingFailure && error.code === "PURCHASE_RECEIPT_TRANSITION_INVALID");
});

test("a confirmed receipt can produce one traceable reversal", () => {
  const confirmed = receiptFixture().confirm("2026-08-13T10:00:00-04:00").receipt;
  const reversed = confirmed.reverse("2026-08-14T10:00:00-04:00");
  assert.equal(reversed.receipt.status, "reversed");
  assert.equal(reversed.event.originalOperationKey, "purchase-receipt:receipt-1:v1");
});

test("purchase return emits a supplier-return event rather than mutating the receipt", () => {
  const purchaseReturn = new PurchaseReturn({
    id: purchaseReturnId("return-1"), companyId: company, supplierId: supplier, receiptId: goodsReceiptId("receipt-1"), returnDate: purchaseDate("2026-08-14"), reason: "Damaged", status: "draft", confirmedAt: null, version: 0,
    lines: [{ id: purchaseReturnLineId("return-line-1"), receiptLineId: goodsReceiptLineId("receipt-line-1"), productId: product, quantity: purchaseQuantity("1", UnitOfMeasure.Each), inventoryLocationReference: "main", lotReference: null, acquisitionValue: moneyFromDecimal("5", VES) }],
  });
  assert.equal(purchaseReturn.confirm("2026-08-14T12:00:00-04:00").event.type, "purchasing.return_confirmed");
});

function receiptFixture(): GoodsReceipt {
  return new GoodsReceipt({
    id: goodsReceiptId("receipt-1"), companyId: company, supplierId: supplier, orderId: purchaseOrderId("order-1"), receiptDate: purchaseDate("2026-08-13"), status: "draft", confirmedAt: null, reversedAt: null, version: 0,
    lines: [{ id: goodsReceiptLineId("receipt-line-1"), orderLineId: orderLine, productId: product, quantity: purchaseQuantity("4", UnitOfMeasure.Each), inventoryLocationReference: "main", lotReference: null, acquisitionValue: { amount: moneyFromDecimal("20", VES), status: "provisional", basis: "Approved purchase order" } }],
  });
}
