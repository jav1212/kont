import assert from "node:assert/strict";
import test from "node:test";
import {
  freezeInventoryBranchAdjustment,
  InventoryBranchAdjustmentFailure,
  RecordInventoryBranchAdjustment,
  validateRecordInventoryBranchAdjustmentCommand,
  type InventoryBranchAdjustment,
  type RecordInventoryBranchAdjustmentCommand,
} from "../../src/application";

const command = {
  actorUserId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  companyId: "J-12345678-9",
  branchId: "00000000-0000-4000-8000-000000000003",
  productId: "product-1",
  type: "ajuste_positivo",
  date: "2026-10-02",
  quantity: "2.5",
  unit: "each",
  unitCostVes: "10",
  reference: "Conteo físico",
  idempotencyKey: "count-2026-10-02-product-1",
} as unknown as RecordInventoryBranchAdjustmentCommand;

const response = {
  movementId: "00000000-0000-4000-8000-000000000004",
  branchId: command.branchId,
  companyId: command.companyId,
  productId: command.productId,
  type: "ajuste_positivo",
  date: command.date,
  quantity: "2.5000",
  unit: "each",
  unitCostVes: "10.0000",
  totalCostVes: "25.0000",
  globalBalance: "12.5000",
  stockRevision: "12",
} as unknown as InventoryBranchAdjustment;

test("validates canonical manual adjustment input and freezes it", () => {
  const result = validateRecordInventoryBranchAdjustmentCommand(command);
  assert.equal(result.quantity, "2.5");
  assert.equal(result.unitCostVes, "10");
  assert.equal(validateRecordInventoryBranchAdjustmentCommand({ ...command, reference: "" }).reference, "");
  assert.equal(Object.isFrozen(result), true);
});

test("rejects invalid adjustment semantics before a write", () => {
  for (const value of [
    { ...command, quantity: "02" },
    { ...command, quantity: "0" },
    { ...command, quantity: "1.00001" },
    { ...command, unitCostVes: null },
    { ...command, type: "ajuste_negativo", unitCostVes: "1" },
    { ...command, reference: "x".repeat(161) },
    { ...command, idempotencyKey: " " },
    { ...command, date: "2026-02-30" },
  ]) {
    assert.throws(
      () => validateRecordInventoryBranchAdjustmentCommand(value as never),
      (error: unknown) => error instanceof InventoryBranchAdjustmentFailure
        && error.code === "INVENTORY_BRANCH_ADJUSTMENT_INVALID",
    );
  }
});

test("freezes exact result output and accepts the valuation cost returned for outbound movements", () => {
  const result = freezeInventoryBranchAdjustment(response);
  assert.equal(result.quantity, "2.5");
  assert.equal(result.totalCostVes, "25");
  assert.equal(Object.isFrozen(result), true);
  assert.doesNotThrow(
    () => freezeInventoryBranchAdjustment({
      ...response, type: "autoconsumo", unitCostVes: "12.3456", totalCostVes: "30.86",
    } as unknown as InventoryBranchAdjustment),
  );
  assert.throws(
    () => freezeInventoryBranchAdjustment({ ...response, unitCostVes: null } as unknown as InventoryBranchAdjustment),
    (error: unknown) => error instanceof InventoryBranchAdjustmentFailure
      && error.code === "INVENTORY_BRANCH_ADJUSTMENT_INVALID",
  );
});

test("passes canonical immutable input and maps unknown failures", async () => {
  let received: RecordInventoryBranchAdjustmentCommand | undefined;
  const result = await new RecordInventoryBranchAdjustment({ async record(value) { received = value; return response; } }).execute(command);
  assert.equal(received?.quantity, "2.5");
  assert.equal(result.globalBalance, "12.5");
  await assert.rejects(
    () => new RecordInventoryBranchAdjustment({ async record(): Promise<never> { throw new Error("reset"); } }).execute(command),
    (error: unknown) => error instanceof InventoryBranchAdjustmentFailure
      && error.code === "INVENTORY_BRANCH_ADJUSTMENT_UNAVAILABLE",
  );
});
