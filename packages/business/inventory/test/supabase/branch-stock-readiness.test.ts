import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseInventoryBranchStockReadinessReader } from "../../src/adapters/supabase";
import {
  InventoryBranchStockReadinessFailure,
  type InventoryBranchStockReadinessQuery,
} from "../../src/application";

const query = {
  actorUserId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  companyId: "J-12345678-9",
  mismatchSampleLimit: 25,
} as unknown as InventoryBranchStockReadinessQuery;

const response = {
  totalProducts: 5,
  nonzeroStockProducts: 3,
  movementReconciliationMismatchProducts: 1,
  linkedWithoutBranchMovementCount: 2,
  unlinkedMovementCount: 3,
  attributedMovementCount: 4,
  unsupportedMovementCount: 1,
  branchCount: 2,
  mismatches: [{
    productId: "product-1",
    code: "",
    measureUnit: "each",
    currentStock: "002.5000",
    signedMovementQuantity: "1.2500",
    difference: "1.2500",
  }],
  generatedAt: "2026-10-02T12:00:00.000Z",
};

function reader(
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>,
): SupabaseInventoryBranchStockReadinessReader {
  return new SupabaseInventoryBranchStockReadinessReader({ rpc } as never);
}

test("invokes the authoritative branch-stock readiness RPC with complete tenant scope", async () => {
  let request: { name: string; args: Record<string, unknown> } | undefined;
  const result = await reader(async (name, args) => {
    request = { name, args };
    return { data: response, error: null };
  }).read(query);
  assert.equal(request?.name, "get_native_inventory_branch_stock_readiness");
  assert.deepEqual(request?.args, {
    p_actor_user_id: query.actorUserId,
    p_organization_id: query.organizationId,
    p_company_id: query.companyId,
    p_mismatch_limit: 25,
  });
  assert.equal(result.mismatches[0]?.code, "");
  assert.equal(result.mismatches[0]?.currentStock, "2.5");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.mismatches), true);
  assert.equal(Object.isFrozen(result.mismatches[0]!), true);
});

test("maps database authorization and validation errors to stable typed failures", async () => {
  for (const [message, code] of [
    ["INVENTORY_BRANCH_STOCK_READINESS_ACCESS_DENIED", "INVENTORY_BRANCH_STOCK_READINESS_ACCESS_DENIED"],
    ["INVENTORY_BRANCH_STOCK_READINESS_INVALID", "INVENTORY_BRANCH_STOCK_READINESS_INVALID"],
  ] as const) {
    await assert.rejects(
      () => reader(async () => ({ data: null, error: { message } })).read(query),
      (error: unknown) => error instanceof InventoryBranchStockReadinessFailure && error.code === code,
    );
  }
});

test("rejects malformed, non-exact, and over-limit readiness responses", async () => {
  for (const data of [
    { ...response, unsupportedMovementCount: "1" },
    { ...response, totalProducts: Number.MAX_SAFE_INTEGER + 1 },
    { ...response, mismatches: [{ ...response.mismatches[0], currentStock: "1e3" }] },
    { ...response, mismatches: Array.from({ length: 26 }, () => response.mismatches[0]) },
  ]) {
    await assert.rejects(
      () => reader(async () => ({ data, error: null })).read(query),
      (error: unknown) => error instanceof InventoryBranchStockReadinessFailure
        && error.code === "INVENTORY_BRANCH_STOCK_READINESS_UNAVAILABLE",
    );
  }
});
