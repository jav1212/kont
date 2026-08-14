import assert from "node:assert/strict";
import test from "node:test";
import { approvedPurchaseOrderFixture, goodsReceiptFixture, supplierFixture } from "../src/index.js";

test("purchasing fixtures share company, supplier, product and order references", () => {
  const supplier = supplierFixture();
  const order = approvedPurchaseOrderFixture();
  const receipt = goodsReceiptFixture();
  assert.equal(order.supplierId, supplier.id);
  assert.equal(receipt.orderId, order.id);
  assert.equal(receipt.lines[0]?.productId, order.lines[0]?.productId);
});
