import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import { SalesFailure, type CustomerInvoiceMatch, type CustomerReturn, type CustomerReturnConfirmed, type GoodsDispatch, type SalesDispatchConfirmed, type SalesDispatchReversed } from "../../src/domain";
import { SALES_ORDER_LINE_ID, approvedSalesOrderFixture, customerFixture, goodsDispatchFixture } from "../../src/testing";
import { ConfirmGoodsDispatch, PostSalesEventToInventory, type SalesCommitPort } from "../../src/application";

test("confirm dispatch atomically commits aggregate and outbox event without calling inventory", async () => {
  const committed: Array<{ dispatch: GoodsDispatch; event: SalesDispatchConfirmed | SalesDispatchReversed }> = [];
  const useCase = new ConfirmGoodsDispatch(
    { find: async () => goodsDispatchFixture() }, { find: async () => customerFixture() }, { find: async () => approvedSalesOrderFixture() },
    { dispatchedAmount: async () => exactDecimal("3"), returnedAmount: async () => exactDecimal("0") },
    commitPort((dispatch, event) => committed.push({ dispatch, event })),
  );
  const dispatch = await useCase.execute(goodsDispatchFixture().id, "2026-08-14T10:00:00-04:00");
  assert.equal(dispatch.status, "confirmed");
  const event = committed[0]?.event;
  assert.equal(event?.type, "sales.dispatch_confirmed");
  if (event?.type !== "sales.dispatch_confirmed") assert.fail("Expected a dispatch confirmation event.");
  assert.equal(event.operationKey, "sales-dispatch:sales-dispatch-1:v1");
});

test("accumulated partial dispatches cannot exceed ordered quantity", async () => {
  let committed = false;
  const useCase = new ConfirmGoodsDispatch(
    { find: async () => goodsDispatchFixture("4") }, { find: async () => customerFixture() }, { find: async () => approvedSalesOrderFixture() },
    { dispatchedAmount: async (lineId) => lineId === SALES_ORDER_LINE_ID ? exactDecimal("7") : exactDecimal("0"), returnedAmount: async () => exactDecimal("0") },
    commitPort(() => { committed = true; }),
  );
  await assert.rejects(() => useCase.execute(goodsDispatchFixture().id, "2026-08-14T10:00:00-04:00"),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_QUANTITY_EXCEEDED");
  assert.equal(committed, false);
});

test("outbox consumer delegates the same event and idempotency key to inventory", async () => {
  const event = goodsDispatchFixture().confirm("2026-08-14T10:00:00-04:00").event;
  const delivered: SalesDispatchConfirmed[] = [];
  const handler = new PostSalesEventToInventory({
    postDispatch: async (received) => { delivered.push(received); return { operationId: "inventory-1" }; },
    reverseDispatch: async () => ({ operationId: "inventory-reversal" }),
    postReturn: async () => ({ operationId: "inventory-return" }),
  });
  await handler.execute(event);
  assert.equal(delivered[0]?.operationKey, event.operationKey);
});

test("does not report confirmation when the atomic commit boundary rejects", async () => {
  const useCase = new ConfirmGoodsDispatch(
    { find: async () => goodsDispatchFixture() }, { find: async () => customerFixture() }, { find: async () => approvedSalesOrderFixture() },
    { dispatchedAmount: async () => exactDecimal("3"), returnedAmount: async () => exactDecimal("0") },
    commitPort(() => { throw new Error("transaction aborted"); }),
  );
  await assert.rejects(() => useCase.execute(goodsDispatchFixture().id, "2026-08-14T10:00:00-04:00"), /transaction aborted/);
});

test("repeated confirmation attempts expose the same deterministic operation key to the commit boundary", async () => {
  const keys: string[] = [];
  const useCase = new ConfirmGoodsDispatch(
    { find: async () => goodsDispatchFixture() }, { find: async () => customerFixture() }, { find: async () => approvedSalesOrderFixture() },
    { dispatchedAmount: async () => exactDecimal("3"), returnedAmount: async () => exactDecimal("0") },
    commitPort((_dispatch, event) => keys.push(event.eventId)),
  );
  await useCase.execute(goodsDispatchFixture().id, "2026-08-14T10:00:00-04:00");
  await useCase.execute(goodsDispatchFixture().id, "2026-08-14T10:00:00-04:00");
  assert.deepEqual(keys, ["sales-dispatch:sales-dispatch-1:v1", "sales-dispatch:sales-dispatch-1:v1"]);
});

function commitPort(onDispatch: (dispatch: GoodsDispatch, event: SalesDispatchConfirmed | SalesDispatchReversed) => void): SalesCommitPort {
  return {
    commitDispatch: async (dispatch, event) => onDispatch(dispatch, event),
    commitReturn: async (_customerReturn: CustomerReturn, _event: CustomerReturnConfirmed) => undefined,
    commitInvoiceMatch: async (_match: CustomerInvoiceMatch) => undefined,
  };
}
