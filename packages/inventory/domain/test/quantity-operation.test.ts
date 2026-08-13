import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies-domain";
import { productId, UnitOfMeasure } from "@kontave/products-domain";
import {
  InventoryFailure,
  InventoryOperation,
  addQuantity,
  inventoryLocationId,
  inventoryOperationId,
  localDate,
  quantity,
  stockEffect,
  stockEffectId,
} from "../src/index.js";

const COMPANY_ID = companyId("company-1");
const PRODUCT_ID = productId("product-1");
const LOCATION_A = inventoryLocationId("location-a");
const LOCATION_B = inventoryLocationId("location-b");

test("quantities use exact decimal arithmetic", () => {
  const result = addQuantity(quantity("0.1", UnitOfMeasure.Kilogram), quantity("0.2", UnitOfMeasure.Kilogram));
  assert.equal(result.amount, "0.3");
});

test("transfer preserves quantity and posted operation reverses with opposite effects", () => {
  const transfer = InventoryOperation.draft({
    id: inventoryOperationId("transfer-1"),
    companyId: COMPANY_ID,
    reason: "transfer",
    effectiveDate: localDate("2026-08-13"),
    source: { kind: "inventory", documentId: "transfer-document-1", operationKey: "transfer:1" },
    effects: [
      stockEffect({ id: stockEffectId("effect-out"), productId: PRODUCT_ID, locationId: LOCATION_A, lotId: null, quantity: quantity("-5", UnitOfMeasure.Each) }),
      stockEffect({ id: stockEffectId("effect-in"), productId: PRODUCT_ID, locationId: LOCATION_B, lotId: null, quantity: quantity("5", UnitOfMeasure.Each) }),
    ],
    reversalOf: null,
  }).post("2026-08-13T14:00:00Z");

  const result = transfer.reverse({
    id: inventoryOperationId("transfer-reversal-1"),
    effectIds: [stockEffectId("reverse-out"), stockEffectId("reverse-in")],
    effectiveDate: "2026-08-13",
    postedAt: "2026-08-13T15:00:00Z",
    source: { kind: "inventory", documentId: "transfer-document-1", operationKey: "transfer:1:reversal" },
  });

  assert.equal(result.original.status, "reversed");
  assert.deepEqual(result.reversal.effects.map((effect) => effect.quantity.amount), ["5", "-5"]);
  assert.equal(result.reversal.reversalOf, transfer.id);
});

test("unbalanced transfer is rejected", () => {
  assert.throws(
    () => InventoryOperation.draft({
      id: inventoryOperationId("transfer-2"),
      companyId: COMPANY_ID,
      reason: "transfer",
      effectiveDate: localDate("2026-08-13"),
      source: { kind: "inventory", documentId: "transfer-document-2", operationKey: "transfer:2" },
      effects: [
        stockEffect({ id: stockEffectId("effect-1"), productId: PRODUCT_ID, locationId: LOCATION_A, lotId: null, quantity: quantity("-5", UnitOfMeasure.Each) }),
        stockEffect({ id: stockEffectId("effect-2"), productId: PRODUCT_ID, locationId: LOCATION_B, lotId: null, quantity: quantity("4", UnitOfMeasure.Each) }),
      ],
      reversalOf: null,
    }),
    (error: unknown) => error instanceof InventoryFailure && error.code === "INVENTORY_TRANSFER_UNBALANCED",
  );
});
