import assert from "node:assert/strict";
import test from "node:test";
import { approvedSalesOrderFixture, customerFixture, goodsDispatchFixture } from "../src/index.js";

test("sales fixtures share company, customer, product and order references", () => {
  const customer = customerFixture();
  const order = approvedSalesOrderFixture();
  const dispatch = goodsDispatchFixture();
  assert.equal(order.customerId, customer.id);
  assert.equal(dispatch.orderId, order.id);
  assert.equal(dispatch.lines[0]?.productId, order.lines[0]?.productId);
});
