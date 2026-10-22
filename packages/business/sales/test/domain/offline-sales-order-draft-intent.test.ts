import assert from "node:assert/strict";
import test from "node:test";
import { SalesFailure, offlineSalesOrderDraftIntentV1 } from "../../src/domain";

function payload() {
  return {
    version: 1,
    customerId: "customer-1",
    customerUpdatedAt: "2026-10-01T12:00:00.000Z",
    orderDate: "2026-10-01",
    currencyCode: "VES",
    lines: [{ productId: "product-1", quantity: "1.2500", expectedPricingVersion: 4, expectedUnitPrice: "99.9900" }],
  } as const;
}

test("offline sales-order intent accepts only the immutable v1 merchandise-price shape", () => {
  const intent = offlineSalesOrderDraftIntentV1(payload());
  assert.equal(intent.version, 1);
  assert.equal(intent.currencyCode, "VES");
  assert.equal(intent.lines[0]?.quantity, "1.25");
  assert.equal(intent.lines[0]?.expectedUnitPrice, "99.99");
  assert.ok(Object.isFrozen(intent));
  assert.ok(Object.isFrozen(intent.lines));
  assert.equal(offlineSalesOrderDraftIntentV1({ ...payload(), customerUpdatedAt: "2026-10-01T08:00:00+04:00" }).customerUpdatedAt, "2026-10-01T08:00:00+04:00");
});

test("offline sales-order intent rejects version drift, duplicate products and invalid exact amounts", () => {
  for (const candidate of [
    { ...payload(), version: 2 },
    { ...payload(), lines: [...payload().lines, { ...payload().lines[0] }] },
    { ...payload(), lines: [{ ...payload().lines[0], quantity: "0" }] },
    { ...payload(), lines: [{ ...payload().lines[0], expectedUnitPrice: "1.00001" }] },
    { ...payload(), lines: [{ ...payload().lines[0], quantity: "10000000000" }] },
    { ...payload(), lines: [{ ...payload().lines[0], expectedPricingVersion: 2_147_483_648 }] },
    { ...payload(), customerUpdatedAt: "2026-02-30T12:00:00.000Z" },
    { ...payload(), orderDate: "2026-02-30" },
  ]) {
    assert.throws(
      () => offlineSalesOrderDraftIntentV1(candidate),
      (error: unknown) => error instanceof SalesFailure && error.code === "SALES_OFFLINE_DRAFT_VALIDATION_FAILED",
    );
  }
});
