import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies-domain";
import { inventoryOperationId, stockEffectId } from "@kontave/inventory-domain";
import { productId, UnitOfMeasure } from "@kontave/products-domain";
import {
  customerId, customerReturnId, customerReturnLineId, goodsDispatchId, goodsDispatchLineId,
  salesDate, salesInstant, salesQuantity, type CustomerReturnConfirmed, type SalesDispatchConfirmed,
} from "@kontave/sales-domain";
import { customerReturnInventoryPosting, salesDispatchInventoryOperation } from "../src/index";

const dispatchEvent: SalesDispatchConfirmed = {
  type: "sales.dispatch_confirmed", eventId: "sales-dispatch:dispatch-1:v1", operationKey: "sales-dispatch:dispatch-1:v1",
  dispatchId: goodsDispatchId("dispatch-1"), companyId: companyId("company-1"), customerId: customerId("customer-1"),
  effectiveDate: salesDate("2026-08-14"), occurredAt: salesInstant("2026-08-14T10:00:00-04:00"),
  lines: [{ id: goodsDispatchLineId("dispatch-line-1"), orderLineId: null, productId: productId("product-1"), quantity: salesQuantity("4", UnitOfMeasure.Each), inventoryLocationReference: "main", lotReference: null }],
};

test("confirmed dispatch becomes an idempotent sales issue without a commercial price", () => {
  const operation = salesDispatchInventoryOperation(dispatchEvent, { operationId: inventoryOperationId("inventory-op-1"), effectIds: [stockEffectId("effect-1")] });
  assert.equal(operation.reason, "sales_issue");
  assert.equal(operation.effects[0]?.quantity.amount, "-4");
  assert.equal(operation.source.operationKey, dispatchEvent.operationKey);
  assert.equal("price" in operation, false);
});

test("customer return restores physical stock and references original dispatch valuation", () => {
  const event: CustomerReturnConfirmed = {
    type: "sales.customer_return_confirmed", eventId: "customer-return:return-1:v1", operationKey: "customer-return:return-1:v1",
    returnId: customerReturnId("return-1"), companyId: dispatchEvent.companyId, customerId: dispatchEvent.customerId, dispatchId: dispatchEvent.dispatchId,
    effectiveDate: salesDate("2026-08-15"), occurredAt: salesInstant("2026-08-15T10:00:00-04:00"),
    lines: [{ id: customerReturnLineId("return-line-1"), dispatchLineId: goodsDispatchLineId("dispatch-line-1"), productId: productId("product-1"), quantity: salesQuantity("1", UnitOfMeasure.Each), inventoryLocationReference: "main", lotReference: null }],
  };
  const posting = customerReturnInventoryPosting(event, { operationId: inventoryOperationId("return-op"), effectIds: [stockEffectId("return-effect")] });
  assert.equal(posting.operation.reason, "customer_return");
  assert.equal(posting.operation.effects[0]?.quantity.amount, "1");
  assert.equal(posting.valuations[0]?.originalDispatchLineId, goodsDispatchLineId("dispatch-line-1"));
});
