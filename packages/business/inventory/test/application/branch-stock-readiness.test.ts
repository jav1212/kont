import assert from "node:assert/strict";
import test from "node:test";
import {
  GetInventoryBranchStockReadiness,
  InventoryBranchStockReadinessFailure,
  validateInventoryBranchStockReadinessQuery,
  type InventoryBranchStockReadinessQuery,
  type InventoryBranchStockReadinessReader,
} from "../../src/application";

const query = {
  actorUserId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  companyId: "J-12345678-9",
} as unknown as InventoryBranchStockReadinessQuery;

test("uses the default bounded sample limit and freezes readiness queries", () => {
  const value = validateInventoryBranchStockReadinessQuery(query);
  assert.equal(value.mismatchSampleLimit, 25);
  assert.equal(Object.isFrozen(value), true);
});

test("accepts readiness mismatch sample limits at the inclusive boundaries", () => {
  assert.equal(validateInventoryBranchStockReadinessQuery({ ...query, mismatchSampleLimit: 1 }).mismatchSampleLimit, 1);
  assert.equal(validateInventoryBranchStockReadinessQuery({ ...query, mismatchSampleLimit: 100 }).mismatchSampleLimit, 100);
});

test("rejects invalid identifier scope and out-of-range readiness sample limits", () => {
  for (const input of [
    { ...query, actorUserId: "not-a-uuid" },
    { ...query, organizationId: "" },
    { ...query, companyId: "  " },
    { ...query, mismatchSampleLimit: 0 },
    { ...query, mismatchSampleLimit: 101 },
    { ...query, mismatchSampleLimit: 1.5 },
  ]) {
    assert.throws(
      () => validateInventoryBranchStockReadinessQuery(input as never),
      (error: unknown) => error instanceof InventoryBranchStockReadinessFailure
        && error.code === "INVENTORY_BRANCH_STOCK_READINESS_INVALID",
    );
  }
});

test("maps unexpected reader failures to the typed unavailable readiness failure", async () => {
  const reader: InventoryBranchStockReadinessReader = {
    async read(): Promise<never> { throw new Error("connection reset"); },
  };
  await assert.rejects(
    () => new GetInventoryBranchStockReadiness(reader).execute(query),
    (error: unknown) => error instanceof InventoryBranchStockReadinessFailure
      && error.code === "INVENTORY_BRANCH_STOCK_READINESS_UNAVAILABLE",
  );
});
