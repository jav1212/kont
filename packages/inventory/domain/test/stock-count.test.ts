import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies-domain";
import { productId, UnitOfMeasure } from "@kontave/products-domain";
import {
  StockCount,
  inventoryLocationId,
  inventoryOperationId,
  quantity,
  stockCountId,
  stockCountLineId,
  stockEffectId,
} from "../src/index.js";

test("confirmed stock count preserves evidence and creates a separate adjustment", () => {
  const count = StockCount.draft({
    id: stockCountId("count-1"),
    companyId: companyId("company-1"),
    locationId: inventoryLocationId("main"),
    countedOn: "2026-08-13",
    lines: [{ id: stockCountLineId("line-1"), productId: productId("product-1"), lotId: null, expected: quantity("20", UnitOfMeasure.Each), counted: quantity("17", UnitOfMeasure.Each) }],
    version: 1,
  });
  const result = count.confirm({
    operationId: inventoryOperationId("adjustment-1"),
    effectIds: [stockEffectId("adjustment-effect-1")],
    source: { kind: "inventory", documentId: "count-1", operationKey: "stock-count:count-1" },
    confirmedAt: "2026-08-13T18:00:00Z",
  });
  assert.equal(result.count.status, "confirmed");
  assert.equal(result.adjustment?.effects[0]?.quantity.amount, "-3");
  assert.equal(result.adjustment?.status, "draft");
});
