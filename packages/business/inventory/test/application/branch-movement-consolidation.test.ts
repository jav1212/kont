import assert from "node:assert/strict";
import test from "node:test";
import {
  GetInventoryBranchMovementConsolidation,
  InventoryBranchMovementConsolidationFailure,
  validateInventoryBranchMovementConsolidationQuery,
  type InventoryBranchMovementConsolidationQuery,
  type InventoryBranchMovementConsolidationReader,
} from "../../src/application";

const query = {
  actorUserId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  companyId: "J-12345678-9",
  from: "2026-01-01",
  to: "2026-01-31",
} as unknown as InventoryBranchMovementConsolidationQuery;

test("validates an inclusive civil period and freezes distinct branch filters", () => {
  const value = validateInventoryBranchMovementConsolidationQuery({
    ...query,
    branchIds: ["00000000-0000-4000-8000-000000000003"],
  });
  assert.deepEqual(value.branchIds, ["00000000-0000-4000-8000-000000000003"]);
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.branchIds!), true);
});

test("rejects invalid, reversed, and overlong consolidation periods", () => {
  for (const input of [
    { ...query, from: "2026-02-30" },
    { ...query, from: "2026-02-01", to: "2026-01-31" },
    { ...query, from: "2025-01-01", to: "2026-01-02" },
  ]) {
    assert.throws(
      () => validateInventoryBranchMovementConsolidationQuery(input),
      (error: unknown) => error instanceof InventoryBranchMovementConsolidationFailure
        && error.code === "INVENTORY_BRANCH_MOVEMENT_CONSOLIDATION_INVALID",
    );
  }
});

test("rejects non-UUID, duplicate, and excessive branch filters", () => {
  const branchId = "00000000-0000-4000-8000-000000000003";
  for (const branchIds of [
    ["not-a-uuid"],
    [branchId, branchId],
    Array.from({ length: 101 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
  ]) {
    assert.throws(
      () => validateInventoryBranchMovementConsolidationQuery({ ...query, branchIds }),
      InventoryBranchMovementConsolidationFailure,
    );
  }
});

test("rejects missing runtime scope values and non-array branch filters", () => {
  for (const input of [
    { ...query, actorUserId: "" },
    { ...query, organizationId: "  " },
    { ...query, companyId: "" },
    { ...query, branchIds: "00000000-0000-4000-8000-000000000003" },
  ]) {
    assert.throws(
      () => validateInventoryBranchMovementConsolidationQuery(input as never),
      (error: unknown) => error instanceof InventoryBranchMovementConsolidationFailure
        && error.code === "INVENTORY_BRANCH_MOVEMENT_CONSOLIDATION_INVALID",
    );
  }
});

test("maps unexpected reader failures to the typed unavailable failure", async () => {
  const reader: InventoryBranchMovementConsolidationReader = {
    async read(): Promise<never> { throw new Error("connection reset"); },
  };
  await assert.rejects(
    () => new GetInventoryBranchMovementConsolidation(reader).execute(query),
    (error: unknown) => error instanceof InventoryBranchMovementConsolidationFailure
      && error.code === "INVENTORY_BRANCH_MOVEMENT_CONSOLIDATION_UNAVAILABLE",
  );
});
