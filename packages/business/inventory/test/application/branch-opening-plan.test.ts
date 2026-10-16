import assert from "node:assert/strict";
import test from "node:test";
import {
  GetInventoryBranchOpeningPlan,
  InventoryBranchOpeningPlanFailure,
  ReplaceInventoryBranchOpeningPlan,
  validateInventoryBranchOpeningPlanQuery,
  validateReplaceInventoryBranchOpeningPlanCommand,
  type InventoryBranchOpeningPlan,
  type InventoryBranchOpeningPlanQuery,
  type InventoryBranchOpeningPlanWriter,
} from "../../src/application";

const scope = {
  actorUserId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  companyId: "J-12345678-9",
  productId: "product-1",
} as unknown as InventoryBranchOpeningPlanQuery;
const branchId = "00000000-0000-4000-8000-000000000003";

const noPlan = {
  productId: "product-1",
  measureUnit: "each",
  companyStock: "8",
  stockRevision: "12",
  plan: null,
} as unknown as InventoryBranchOpeningPlan;

test("validates and freezes an opening plan product scope", () => {
  const value = validateInventoryBranchOpeningPlanQuery(scope);
  assert.deepEqual(value, scope);
  assert.equal(Object.isFrozen(value), true);
});

test("normalizes only canonical, positive, distinct, four-place allocation lines", () => {
  const value = validateReplaceInventoryBranchOpeningPlanCommand({
    ...scope,
    expectedStockRevision: "12",
    expectedPlanRevision: 0,
    lines: [{ branchId, quantity: "8" }],
  });
  assert.equal(value.lines[0]?.quantity, "8");
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.lines), true);
  assert.equal(Object.isFrozen(value.lines[0]!), true);
});

test("rejects invalid opening allocation scope, revisions, and line invariants", () => {
  const command = {
    ...scope,
    expectedStockRevision: "12",
    expectedPlanRevision: 0,
    lines: [{ branchId, quantity: "8" }],
  };
  for (const input of [
    { ...scope, actorUserId: "invalid" },
    { ...scope, productId: " " },
    { ...command, expectedStockRevision: "012" },
    { ...command, expectedStockRevision: "9223372036854775808" },
    { ...command, expectedPlanRevision: -1 },
    { ...command, expectedPlanRevision: 2_147_483_648 },
    { ...command, lines: [] },
    { ...command, lines: [{ branchId, quantity: "08" }] },
    { ...command, lines: [{ branchId, quantity: "0" }] },
    { ...command, lines: [{ branchId, quantity: "1.00001" }] },
    { ...command, lines: [{ branchId, quantity: "1" }, { branchId, quantity: "7" }] },
  ]) {
    assert.throws(
      () => validateReplaceInventoryBranchOpeningPlanCommand(input as never),
      (error: unknown) => error instanceof InventoryBranchOpeningPlanFailure
        && error.code === "INVENTORY_BRANCH_OPENING_INVALID",
    );
  }
});

test("freezes a reader response and maps unexpected reader failures", async () => {
  const result = await new GetInventoryBranchOpeningPlan({ async read() { return noPlan; } }).execute(scope);
  assert.equal(Object.isFrozen(result), true);
  await assert.rejects(
    () => new GetInventoryBranchOpeningPlan({ async read(): Promise<never> { throw new Error("connection reset"); } }).execute(scope),
    (error: unknown) => error instanceof InventoryBranchOpeningPlanFailure
      && error.code === "INVENTORY_BRANCH_OPENING_UNAVAILABLE",
  );
});

test("passes a full immutable replacement to the writer and rejects inconsistent writer output", async () => {
  let received: unknown;
  const writer: InventoryBranchOpeningPlanWriter = {
    async replace(command) {
      received = command;
      return {
        ...noPlan,
        plan: {
          revision: 1,
          snapshotStockRevision: "12",
          snapshotCompanyStock: "8",
          totalAllocated: "8",
          stale: false,
          updatedAt: "2026-10-02T12:00:00.000Z",
          lines: [{ branchId, branchCode: "CCS", quantity: "8" }],
        },
      } as unknown as InventoryBranchOpeningPlan;
    },
  };
  const result = await new ReplaceInventoryBranchOpeningPlan(writer).execute({
    ...scope,
    expectedStockRevision: "12",
    expectedPlanRevision: 0,
    lines: [{ branchId, quantity: "8" }],
  });
  assert.equal((received as { lines: readonly { quantity: string }[] }).lines[0]?.quantity, "8");
  assert.equal(Object.isFrozen(result.plan?.lines), true);
  const bad: InventoryBranchOpeningPlanWriter = {
    async replace() {
      return {
        ...noPlan,
        plan: {
          revision: 1,
          snapshotStockRevision: "12",
          snapshotCompanyStock: "8",
          totalAllocated: "7",
          stale: false,
          updatedAt: "2026-10-02T12:00:00.000Z",
          lines: [{ branchId, branchCode: "CCS", quantity: "8" }],
        },
      } as unknown as InventoryBranchOpeningPlan;
    },
  };
  await assert.rejects(
    () => new ReplaceInventoryBranchOpeningPlan(bad).execute({
      ...scope, expectedStockRevision: "12", expectedPlanRevision: 0, lines: [{ branchId, quantity: "8" }],
    }),
    (error: unknown) => error instanceof InventoryBranchOpeningPlanFailure
      && error.code === "INVENTORY_BRANCH_OPENING_INVALID",
  );
});
