import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseInventoryBranchAdjustmentWriter } from "../../src/adapters/supabase";
import { InventoryBranchAdjustmentFailure, type RecordInventoryBranchAdjustmentCommand } from "../../src/application";

const command = {
  actorUserId: "00000000-0000-4000-8000-000000000001", organizationId: "00000000-0000-4000-8000-000000000002", companyId: "J-12345678-9", branchId: "00000000-0000-4000-8000-000000000003", productId: "product-1", type: "ajuste_positivo", date: "2026-10-02", quantity: "2.5", unit: "each", unitCostVes: "10", reference: "Conteo", idempotencyKey: "key-1",
} as unknown as RecordInventoryBranchAdjustmentCommand;
const response = { movementId: "00000000-0000-4000-8000-000000000004", branchId: command.branchId, companyId: command.companyId, productId: command.productId, type: "ajuste_positivo", date: command.date, quantity: "2.5000", unit: "each", unitCostVes: "10.0000", totalCostVes: "25.0000", globalBalance: "12.5000", stockRevision: "12" };
function writer(rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>) { return new SupabaseInventoryBranchAdjustmentWriter({ rpc } as never); }

test("invokes the authoritative adjustment RPC with all scope and idempotency values", async () => {
  let request: { name: string; args: Record<string, unknown> } | undefined;
  const result = await writer(async (name, args) => { request = { name, args }; return { data: response, error: null }; }).record(command);
  assert.equal(request?.name, "record_native_inventory_branch_adjustment");
  assert.deepEqual(request?.args, { p_actor_user_id: command.actorUserId, p_organization_id: command.organizationId, p_company_id: command.companyId, p_branch_id: command.branchId, p_product_id: command.productId, p_type: command.type, p_date: command.date, p_quantity: command.quantity, p_unit: command.unit, p_unit_cost_ves: command.unitCostVes, p_reference: command.reference, p_idempotency_key: command.idempotencyKey });
  assert.equal(result.totalCostVes, "25");
});

test("maps every expected adjustment error and rejects malformed response", async () => {
  for (const code of ["INVENTORY_BRANCH_ADJUSTMENT_INVALID", "INVENTORY_BRANCH_ADJUSTMENT_ACCESS_DENIED", "INVENTORY_BRANCH_ADJUSTMENT_PERIOD_CLOSED", "INVENTORY_BRANCH_ADJUSTMENT_STOCK_INSUFFICIENT", "INVENTORY_BRANCH_ADJUSTMENT_IDEMPOTENCY_CONFLICT", "INVENTORY_BRANCH_ADJUSTMENT_PRODUCT_UNAVAILABLE"] as const) {
    await assert.rejects(() => writer(async () => ({ data: null, error: { message: code } })).record(command), (error: unknown) => error instanceof InventoryBranchAdjustmentFailure && error.code === code);
  }
  await assert.rejects(() => writer(async () => ({ data: { ...response, quantity: "1e3" }, error: null })).record(command), (error: unknown) => error instanceof InventoryBranchAdjustmentFailure && error.code === "INVENTORY_BRANCH_ADJUSTMENT_UNAVAILABLE");
  await assert.rejects(() => writer(async () => ({
    data: { ...response, branchId: "00000000-0000-4000-8000-000000000005" }, error: null,
  })).record(command), (error: unknown) => error instanceof InventoryBranchAdjustmentFailure && error.code === "INVENTORY_BRANCH_ADJUSTMENT_UNAVAILABLE");
});
