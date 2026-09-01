import assert from "node:assert/strict";
import test from "node:test";
import {
  ClientInputValidationError,
  decodeCreateInventoryOperation,
  decodeInventoryDashboardQuery,
  decodeUpdateCurrentUser,
  decodeUpdateProductInventoryProfile,
  decodeUpdateProductSalePricing,
  decodeUpdateProduct,
  definePresentationRegistry,
  type ClientFeature,
  type PresentationRegistry,
} from "../src/index";

test("presentation registries preserve explicit feature classifications", () => {
  type Features = {
    readonly products: ClientFeature<unknown>;
    readonly inventory: ClientFeature<unknown>;
  };
  const registry = definePresentationRegistry<Features>({
    products: { status: "ready" },
    inventory: { status: "planned", reason: "Client presentation pending" },
  }) satisfies PresentationRegistry<Features>;
  assert.equal(registry.products.status, "ready");
  assert.ok(Object.isFrozen(registry));
});

test("serializable input decoders reject unexpected fields and preserve exact amounts", () => {
  const command = decodeCreateInventoryOperation({
    reason: "opening_balance",
    effectiveDate: "2026-08-17",
    lines: [{ productId: "product-1", direction: "inbound", quantity: "10.250", unit: "each", unitCost: "1.005" }],
  });
  assert.equal(command.lines[0]?.quantity, "10.250");
  assert.throws(
    () => decodeCreateInventoryOperation({ ...command, untrusted: true }),
    ClientInputValidationError,
  );
  assert.throws(
    () => decodeUpdateProduct({ expectedVersion: 1, name: "A", injected: "x" }),
    ClientInputValidationError,
  );
});

test("dashboard decoders validate civil periods and bounded limits", () => {
  assert.deepEqual(decodeInventoryDashboardQuery({ from: "2026-08-01", to: "2026-08-17", limit: 5 }), {
    from: "2026-08-01", to: "2026-08-17", limit: 5,
  });
  assert.throws(
    () => decodeInventoryDashboardQuery({ from: "2026-08-17", to: "2026-08-01" }),
    ClientInputValidationError,
  );
  assert.throws(
    () => decodeInventoryDashboardQuery({ from: "2026-08-01", to: "2026-08-17", limit: 101 }),
    ClientInputValidationError,
  );
});

test("versioned mutations reject stale zero versions and invalid negative values", () => {
  assert.throws(
    () => decodeUpdateCurrentUser({ expectedVersion: 1 }),
    ClientInputValidationError,
  );
  assert.throws(
    () => decodeUpdateProduct({ expectedVersion: 0, name: "Producto" }),
    ClientInputValidationError,
  );
  assert.throws(
    () =>
      decodeUpdateProductInventoryProfile({
        expectedVersion: 1,
        minimumQuantity: "-1",
      }),
    ClientInputValidationError,
  );
  assert.throws(
    () =>
      decodeUpdateProductSalePricing({
        expectedVersion: 1,
        policy: { mode: "fixed", amount: "0", currency: "VES" },
      }),
    ClientInputValidationError,
  );
  assert.throws(
    () =>
      decodeCreateInventoryOperation({
        reason: "opening_balance",
        effectiveDate: "2026-08-17",
        lines: [
          {
            productId: "product-1",
            direction: "inbound",
            quantity: "-1",
            unit: "each",
          },
        ],
      }),
    ClientInputValidationError,
  );
});
