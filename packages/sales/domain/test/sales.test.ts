import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies-domain";
import { currency, moneyFromDecimal } from "@kontave/monetary-domain";
import { productId, UnitOfMeasure } from "@kontave/products-domain";
import {
  CustomerReturn, GoodsDispatch, SalesFailure, SalesOrder, customerId, customerReturnId, customerReturnLineId,
  goodsDispatchId, goodsDispatchLineId, salesDate, salesOrderId, salesOrderLineId, salesQuantity,
} from "../src/index";

const VES = currency("VES", 2);
const company = companyId("company-1");
const customer = customerId("customer-1");
const product = productId("product-1");
const orderLine = salesOrderLineId("order-line-1");

test("sales order models the commercial agreement without a POS presentation concept", () => {
  const order = new SalesOrder({
    id: salesOrderId("order-1"), companyId: company, customerId: customer, orderDate: salesDate("2026-08-14"), transactionCurrency: VES,
    paymentTerms: { kind: "immediate" }, status: "draft", version: 0,
    lines: [{ id: orderLine, kind: "stock", productId: product, description: "Stock item", orderedQuantity: salesQuantity("10", UnitOfMeasure.Each), unitPrice: moneyFromDecimal("5", VES), grossAmount: moneyFromDecimal("50", VES), adjustments: [], netAmount: moneyFromDecimal("50", VES) }],
  });
  assert.equal(order.approve().status, "approved");
  assert.equal("channel" in order, false);
  assert.throws(() => order.close(), (error: unknown) => error instanceof SalesFailure && error.code === "SALES_ORDER_TRANSITION_INVALID");
});

test("confirming dispatch emits a stable inventory operation key independently from invoicing", () => {
  const confirmed = dispatchFixture().confirm("2026-08-14T10:00:00-04:00");
  assert.equal(confirmed.dispatch.status, "confirmed");
  assert.equal(confirmed.event.operationKey, "sales-dispatch:dispatch-1:v1");
  assert.equal("fiscalDocumentId" in confirmed.event, false);
});

test("customer return emits a stock event rather than mutating the dispatch", () => {
  const customerReturn = new CustomerReturn({
    id: customerReturnId("return-1"), companyId: company, customerId: customer, dispatchId: goodsDispatchId("dispatch-1"), returnDate: salesDate("2026-08-15"), reason: "Damaged", status: "draft", confirmedAt: null, version: 0,
    lines: [{ id: customerReturnLineId("return-line-1"), dispatchLineId: goodsDispatchLineId("dispatch-line-1"), productId: product, quantity: salesQuantity("1", UnitOfMeasure.Each), inventoryLocationReference: "main", lotReference: null }],
  });
  assert.equal(customerReturn.confirm("2026-08-15T12:00:00-04:00").event.type, "sales.customer_return_confirmed");
});

function dispatchFixture(): GoodsDispatch {
  return new GoodsDispatch({
    id: goodsDispatchId("dispatch-1"), companyId: company, customerId: customer, orderId: salesOrderId("order-1"), dispatchDate: salesDate("2026-08-14"), status: "draft", confirmedAt: null, reversedAt: null, version: 0,
    lines: [{ id: goodsDispatchLineId("dispatch-line-1"), orderLineId: orderLine, productId: product, quantity: salesQuantity("4", UnitOfMeasure.Each), inventoryLocationReference: "main", lotReference: null }],
  });
}
