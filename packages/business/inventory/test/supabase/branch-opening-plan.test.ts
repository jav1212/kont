import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseInventoryBranchOpeningPlanRepository } from "../../src/adapters/supabase";
import {
  InventoryBranchOpeningPlanFailure,
  type InventoryBranchOpeningPlanQuery,
  type ReplaceInventoryBranchOpeningPlanCommand,
} from "../../src/application";

const scope = {
  actorUserId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  companyId: "J-12345678-9",
  productId: "product-1",
} as unknown as InventoryBranchOpeningPlanQuery;
const branchId = "00000000-0000-4000-8000-000000000003";
const command = {
  ...scope,
  expectedStockRevision: "12",
  expectedPlanRevision: 0,
  lines: [{ branchId, quantity: "8" }],
} as unknown as ReplaceInventoryBranchOpeningPlanCommand;
const noPlan = {
  productId: "product-1",
  measureUnit: "each",
  companyStock: "8",
  stockRevision: "12",
  plan: null,
};
const plan = {
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
};

function repository(
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>,
): SupabaseInventoryBranchOpeningPlanRepository {
  return new SupabaseInventoryBranchOpeningPlanRepository({ rpc } as never);
}

test("invokes the read RPC with the complete tenant and product scope", async () => {
  let request: { name: string; args: Record<string, unknown> } | undefined;
  const result = await repository(async (name, args) => {
    request = { name, args };
    return { data: noPlan, error: null };
  }).read(scope);
  assert.equal(request?.name, "get_native_inventory_branch_opening_plan");
  assert.deepEqual(request?.args, {
    p_actor_user_id: scope.actorUserId,
    p_organization_id: scope.organizationId,
    p_company_id: scope.companyId,
    p_product_id: scope.productId,
  });
  assert.equal(result.companyStock, "8");
  assert.equal(Object.isFrozen(result), true);
});

test("normalizes fixed-scale PostgreSQL numeric text without weakening command serialization", async () => {
  const result = await repository(async () => ({
    data: {
      ...plan,
      companyStock: "2.0000",
      plan: {
        ...plan.plan,
        snapshotCompanyStock: "2.0000",
        totalAllocated: "2.0000",
        lines: [{ ...plan.plan.lines[0], quantity: "1.0000" }, { branchId: "00000000-0000-4000-8000-000000000004", branchCode: "VLC", quantity: "1.0000" }],
      },
    },
    error: null,
  })).read(scope);
  assert.equal(result.companyStock, "2");
  assert.equal(result.plan?.snapshotCompanyStock, "2");
  assert.equal(result.plan?.totalAllocated, "2");
  assert.equal(result.plan?.lines[0]?.quantity, "1");
  const zeroStock = await repository(async () => ({
    data: { ...noPlan, companyStock: "0.0000" },
    error: null,
  })).read(scope);
  assert.equal(zeroStock.companyStock, "0");
});

test("invokes replacement with canonical JSON lines and optimistic revisions", async () => {
  let request: { name: string; args: Record<string, unknown> } | undefined;
  const result = await repository(async (name, args) => {
    request = { name, args };
    return { data: plan, error: null };
  }).replace(command);
  assert.equal(request?.name, "replace_native_inventory_branch_opening_plan");
  assert.deepEqual(request?.args, {
    p_actor_user_id: command.actorUserId,
    p_organization_id: command.organizationId,
    p_company_id: command.companyId,
    p_product_id: command.productId,
    p_expected_stock_revision: "12",
    p_expected_plan_revision: 0,
    p_lines: [{ branchId, quantity: "8" }],
  });
  assert.equal(result.plan?.totalAllocated, "8");
  assert.equal(Object.isFrozen(result.plan?.lines), true);
});

test("maps every authoritative opening-plan error to a stable typed failure", async () => {
  for (const code of [
    "INVENTORY_BRANCH_OPENING_ACCESS_DENIED",
    "INVENTORY_BRANCH_OPENING_INVALID",
    "INVENTORY_BRANCH_OPENING_STOCK_CONFLICT",
    "INVENTORY_BRANCH_OPENING_PLAN_CONFLICT",
    "INVENTORY_BRANCH_OPENING_STOCK_NOT_POSITIVE",
    "INVENTORY_BRANCH_OPENING_SUM_MISMATCH",
  ] as const) {
    await assert.rejects(
      () => repository(async () => ({ data: null, error: { message: code } })).read(scope),
      (error: unknown) => error instanceof InventoryBranchOpeningPlanFailure && error.code === code,
    );
  }
});

test("rejects malformed, non-canonical, inconsistent, and foreign product responses", async () => {
  for (const data of [
    { ...noPlan, companyStock: "1e3" },
    { ...plan, productId: "product-2" },
    { ...plan, plan: { ...plan.plan, totalAllocated: "7" } },
    { ...plan, plan: { ...plan.plan, stale: true } },
    { ...plan, plan: { ...plan.plan, lines: [{ ...plan.plan.lines[0], quantity: "1.00001" }] } },
  ]) {
    await assert.rejects(
      () => repository(async () => ({ data, error: null })).read(scope),
      (error: unknown) => error instanceof InventoryBranchOpeningPlanFailure
        && error.code === "INVENTORY_BRANCH_OPENING_UNAVAILABLE",
    );
  }
});

test("rejects a replacement response that has no durable draft", async () => {
  await assert.rejects(
    () => repository(async () => ({ data: noPlan, error: null })).replace(command),
    (error: unknown) => error instanceof InventoryBranchOpeningPlanFailure
      && error.code === "INVENTORY_BRANCH_OPENING_UNAVAILABLE",
  );
});
