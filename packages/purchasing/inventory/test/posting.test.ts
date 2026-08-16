import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies-domain";
import { inventoryOperationId, stockEffectId } from "@kontave/inventory-domain";
import { currency, moneyFromDecimal } from "@kontave/monetary-domain";
import { productId, UnitOfMeasure } from "@kontave/products-domain";
import { goodsReceiptId, goodsReceiptLineId, purchaseDate, purchaseInstant, purchaseQuantity, purchaseReturnId, purchaseReturnLineId, supplierId, type PurchaseReceiptConfirmed, type PurchaseReturnConfirmed } from "@kontave/purchasing-domain";
import { purchaseReceiptInventoryPosting, purchaseReturnInventoryOperation, reversePurchaseReceiptInventoryOperation } from "../src/index";

const VES = currency("VES", 2);
const receiptEvent: PurchaseReceiptConfirmed = {
  type: "purchasing.receipt_confirmed", eventId: "purchase-receipt:receipt-1:v1", operationKey: "purchase-receipt:receipt-1:v1",
  receiptId: goodsReceiptId("receipt-1"), companyId: companyId("company-1"), supplierId: supplierId("supplier-1"),
  effectiveDate: purchaseDate("2026-08-13"), occurredAt: purchaseInstant("2026-08-13T10:00:00-04:00"),
  lines: [{ id: goodsReceiptLineId("receipt-line-1"), orderLineId: null, productId: productId("product-1"), quantity: purchaseQuantity("4", UnitOfMeasure.Each), inventoryLocationReference: "main", lotReference: null, acquisitionValue: { amount: moneyFromDecimal("20", VES), status: "recognized", basis: "Matched invoice" } }],
};

test("confirmed receipt becomes a posted inventory receipt with valuation instructions", () => {
  const posting = purchaseReceiptInventoryPosting(receiptEvent, { operationId: inventoryOperationId("inventory-op-1"), effectIds: [stockEffectId("effect-1")] });
  assert.equal(posting.operation.reason, "purchase_receipt");
  assert.equal(posting.operation.status, "posted");
  assert.equal(posting.operation.source.operationKey, receiptEvent.operationKey);
  assert.equal(posting.valuations[0]?.acquisitionValue.minorAmount, 2_000n);
});

test("reprocessing the event preserves the same source operation key", () => {
  const first = purchaseReceiptInventoryPosting(receiptEvent, { operationId: inventoryOperationId("inventory-op-1"), effectIds: [stockEffectId("effect-1")] });
  const retry = purchaseReceiptInventoryPosting(receiptEvent, { operationId: inventoryOperationId("inventory-op-2"), effectIds: [stockEffectId("effect-2")] });
  assert.equal(first.operation.source.operationKey, retry.operation.source.operationKey);
});

test("purchase return reduces stock and receipt correction uses an inventory reversal", () => {
  const original = purchaseReceiptInventoryPosting(receiptEvent, { operationId: inventoryOperationId("inventory-op-1"), effectIds: [stockEffectId("effect-1")] }).operation;
  const returnEvent: PurchaseReturnConfirmed = {
    type: "purchasing.return_confirmed", eventId: "purchase-return:return-1:v1", operationKey: "purchase-return:return-1:v1",
    returnId: purchaseReturnId("return-1"), companyId: receiptEvent.companyId, supplierId: receiptEvent.supplierId, receiptId: receiptEvent.receiptId,
    effectiveDate: purchaseDate("2026-08-14"), occurredAt: purchaseInstant("2026-08-14T10:00:00-04:00"),
    lines: [{ id: purchaseReturnLineId("return-line-1"), receiptLineId: goodsReceiptLineId("receipt-line-1"), productId: productId("product-1"), quantity: purchaseQuantity("1", UnitOfMeasure.Each), inventoryLocationReference: "main", lotReference: null, acquisitionValue: moneyFromDecimal("5", VES) }],
  };
  const returned = purchaseReturnInventoryOperation(returnEvent, { operationId: inventoryOperationId("return-op"), effectIds: [stockEffectId("return-effect")] });
  assert.equal(returned.reason, "supplier_return");
  assert.equal(returned.effects[0]?.quantity.amount, "-1");
  const reversal = reversePurchaseReceiptInventoryOperation({ original, event: { type: "purchasing.receipt_reversed", eventId: "reversal-1", originalOperationKey: receiptEvent.operationKey, receiptId: receiptEvent.receiptId, companyId: receiptEvent.companyId, effectiveDate: receiptEvent.effectiveDate, occurredAt: purchaseInstant("2026-08-14T12:00:00-04:00") }, ids: { operationId: inventoryOperationId("reversal-op"), effectIds: [stockEffectId("reversal-effect")] } });
  assert.equal(reversal.reversal.reason, "reversal");
  assert.equal(reversal.reversal.effects[0]?.quantity.amount, "-4");
});
