import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import { ConfirmGoodsReceipt, PostPurchasingEventToInventory, type PurchasingCommitPort } from "../../src/application";
import { PurchasingFailure, type GoodsReceipt, type PurchaseReceiptConfirmed, type PurchaseReceiptReversed, type PurchaseReturn, type PurchaseReturnConfirmed, type SupplierInvoiceMatch } from "../../src/domain";
import { PURCHASING_ORDER_LINE_ID, approvedPurchaseOrderFixture, goodsReceiptFixture, supplierFixture } from "../../src/testing";

test("confirm receipt atomically commits the aggregate and outbox event without calling inventory directly", async () => {
  const committed: Array<{ receipt: GoodsReceipt; event: PurchaseReceiptConfirmed | PurchaseReceiptReversed }> = [];
  const commit = commitPort((receipt, event) => committed.push({ receipt, event }));
  const useCase = new ConfirmGoodsReceipt(
    { find: async () => goodsReceiptFixture() }, { find: async () => supplierFixture() }, { find: async () => approvedPurchaseOrderFixture() },
    { receivedAmount: async () => exactDecimal("3"), returnedAmount: async () => exactDecimal("0") }, commit,
  );
  const receipt = await useCase.execute(goodsReceiptFixture().id, "2026-08-13T10:00:00-04:00");
  assert.equal(receipt.status, "confirmed");
  assert.equal(committed.length, 1);
  const event = committed[0]?.event;
  assert.equal(event?.type, "purchasing.receipt_confirmed");
  if (event?.type !== "purchasing.receipt_confirmed") assert.fail("Expected a receipt confirmation event.");
  assert.equal(event.operationKey, "purchase-receipt:purchasing-receipt-1:v1");
});

test("accumulated partial receipts cannot exceed the ordered quantity", async () => {
  let committed = false;
  const useCase = new ConfirmGoodsReceipt(
    { find: async () => goodsReceiptFixture("4") }, { find: async () => supplierFixture() }, { find: async () => approvedPurchaseOrderFixture() },
    { receivedAmount: async (lineId) => lineId === PURCHASING_ORDER_LINE_ID ? exactDecimal("7") : exactDecimal("0"), returnedAmount: async () => exactDecimal("0") },
    commitPort(() => { committed = true; }),
  );
  await assert.rejects(() => useCase.execute(goodsReceiptFixture().id, "2026-08-13T10:00:00-04:00"),
    (error: unknown) => error instanceof PurchasingFailure && error.code === "PURCHASE_QUANTITY_EXCEEDED");
  assert.equal(committed, false);
});

test("outbox consumer delegates the same event and idempotency key to inventory", async () => {
  const event = goodsReceiptFixture().confirm("2026-08-13T10:00:00-04:00").event;
  const delivered: PurchaseReceiptConfirmed[] = [];
  const handler = new PostPurchasingEventToInventory({
    postReceipt: async (received) => { delivered.push(received); return { operationId: "inventory-1" }; },
    reverseReceipt: async () => ({ operationId: "inventory-reversal" }),
    postReturn: async () => ({ operationId: "inventory-return" }),
  });
  await handler.execute(event);
  assert.equal(delivered[0]?.operationKey, event.operationKey);
});

test("does not report confirmation when the atomic commit boundary rejects", async () => {
  const useCase = new ConfirmGoodsReceipt(
    { find: async () => goodsReceiptFixture() }, { find: async () => supplierFixture() }, { find: async () => approvedPurchaseOrderFixture() },
    { receivedAmount: async () => exactDecimal("3"), returnedAmount: async () => exactDecimal("0") },
    commitPort(() => { throw new Error("transaction aborted"); }),
  );
  await assert.rejects(() => useCase.execute(goodsReceiptFixture().id, "2026-08-13T10:00:00-04:00"), /transaction aborted/);
});

test("repeated confirmation attempts expose the same deterministic operation key to the commit boundary", async () => {
  const keys: string[] = [];
  const useCase = new ConfirmGoodsReceipt(
    { find: async () => goodsReceiptFixture() }, { find: async () => supplierFixture() }, { find: async () => approvedPurchaseOrderFixture() },
    { receivedAmount: async () => exactDecimal("3"), returnedAmount: async () => exactDecimal("0") },
    commitPort((_receipt, event) => keys.push(event.eventId)),
  );
  await useCase.execute(goodsReceiptFixture().id, "2026-08-13T10:00:00-04:00");
  await useCase.execute(goodsReceiptFixture().id, "2026-08-13T10:00:00-04:00");
  assert.deepEqual(keys, ["purchase-receipt:purchasing-receipt-1:v1", "purchase-receipt:purchasing-receipt-1:v1"]);
});

function commitPort(onReceipt: (receipt: GoodsReceipt, event: PurchaseReceiptConfirmed | PurchaseReceiptReversed) => void): PurchasingCommitPort {
  return {
    commitReceipt: async (receipt, event) => onReceipt(receipt, event),
    commitReturn: async (_purchaseReturn: PurchaseReturn, _event: PurchaseReturnConfirmed) => undefined,
    commitInvoiceMatch: async (_match: SupplierInvoiceMatch) => undefined,
  };
}
