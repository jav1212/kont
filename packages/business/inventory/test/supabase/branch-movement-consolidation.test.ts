import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseInventoryBranchMovementConsolidationReader } from "../../src/adapters/supabase";
import {
  InventoryBranchMovementConsolidationFailure,
  type InventoryBranchMovementConsolidationQuery,
} from "../../src/application";

const query = {
  actorUserId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  companyId: "J-12345678-9",
  from: "2026-01-01",
  to: "2026-01-31",
  branchIds: ["00000000-0000-4000-8000-000000000003"],
} as unknown as InventoryBranchMovementConsolidationQuery;

const response = {
  period: { from: "2026-01-01", to: "2026-01-31" },
  rows: [{
    branchId: "00000000-0000-4000-8000-000000000003",
    branchCode: "CCS",
    branchName: "Caracas",
    sourceType: "purchase",
    productId: "product-1",
    productName: "Producto",
    measureUnit: "each",
    movementType: "entrada_compra",
    movementCount: 2,
    quantity: "002.5000",
    totalCostVes: "100.2500",
  }],
  coverage: {
    attributedMovementCount: 2,
    linkedWithoutBranchMovementCount: null,
    unlinkedMovementCount: null,
    includesCompanyWideCoverage: false,
  },
  generatedAt: "2026-01-31T12:00:00.000Z",
};

function reader(
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>,
): SupabaseInventoryBranchMovementConsolidationReader {
  return new SupabaseInventoryBranchMovementConsolidationReader({ rpc } as never);
}

test("invokes the authoritative branch movement RPC with complete tenant scope", async () => {
  let request: { name: string; args: Record<string, unknown> } | undefined;
  const result = await reader(async (name, args) => {
    request = { name, args };
    return { data: response, error: null };
  }).read(query);

  assert.equal(request?.name, "get_native_inventory_branch_movement_consolidation");
  assert.deepEqual(request?.args, {
    p_actor_user_id: query.actorUserId,
    p_organization_id: query.organizationId,
    p_company_id: query.companyId,
    p_from: query.from,
    p_to: query.to,
    p_branch_ids: query.branchIds,
  });
  assert.equal(result.rows[0]?.quantity, "2.5");
  assert.equal(result.rows[0]?.totalCostVes, "100.25");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.rows), true);
  assert.equal(Object.isFrozen(result.rows[0]!), true);
});

test("sends SQL null for an omitted branch filter", async () => {
  let args: Record<string, unknown> | undefined;
  const { branchIds: _branchIds, ...unfilteredQuery } = query;
  await reader(async (_, request) => {
    args = request;
    return { data: response, error: null };
  }).read(unfilteredQuery);
  assert.equal(args?.p_branch_ids, null);
});

test("accepts the manual source type emitted by branch-attributed adjustments", async () => {
  const result = await reader(async () => ({
    data: { ...response, rows: [{ ...response.rows[0], sourceType: "manual" }] }, error: null,
  })).read(query);
  assert.equal(result.rows[0]?.sourceType, "manual");
});

test("accepts the historical source type emitted by reviewed historical attributions", async () => {
  const result = await reader(async () => ({
    data: { ...response, rows: [{ ...response.rows[0], sourceType: "historical" }] }, error: null,
  })).read(query);
  assert.equal(result.rows[0]?.sourceType, "historical");
});

test("maps authoritative access denial to a stable typed error", async () => {
  await assert.rejects(
    () => reader(async () => ({
      data: null,
      error: { message: "INVENTORY_BRANCH_CONSOLIDATION_ACCESS_DENIED" },
    })).read(query),
    (error: unknown) => error instanceof InventoryBranchMovementConsolidationFailure
      && error.code === "INVENTORY_BRANCH_MOVEMENT_CONSOLIDATION_ACCESS_DENIED",
  );
});

test("maps the deployed invalid-query error to a stable typed error", async () => {
  await assert.rejects(
    () => reader(async () => ({
      data: null,
      error: { message: "INVENTORY_BRANCH_CONSOLIDATION_INVALID" },
    })).read(query),
    (error: unknown) => error instanceof InventoryBranchMovementConsolidationFailure
      && error.code === "INVENTORY_BRANCH_MOVEMENT_CONSOLIDATION_INVALID",
  );
});

test("rejects a returned period or coverage outside the established response contract", async () => {
  for (const data of [
    { ...response, period: { ...response.period, to: "2026-02-01" } },
    {
      ...response,
      coverage: {
        ...response.coverage,
        includesCompanyWideCoverage: true,
      },
    },
  ]) {
    await assert.rejects(
      () => reader(async () => ({ data, error: null })).read(query),
      (error: unknown) => error instanceof InventoryBranchMovementConsolidationFailure
        && error.code === "INVENTORY_BRANCH_MOVEMENT_CONSOLIDATION_UNAVAILABLE",
    );
  }
});

test("rejects malformed RPC data and non-exact decimal output", async () => {
  for (const data of [
    { ...response, rows: [{ ...response.rows[0], movementCount: "2" }] },
    { ...response, rows: [{ ...response.rows[0], quantity: "1e3" }] },
  ]) {
    await assert.rejects(
      () => reader(async () => ({ data, error: null })).read(query),
      (error: unknown) => error instanceof InventoryBranchMovementConsolidationFailure
        && error.code === "INVENTORY_BRANCH_MOVEMENT_CONSOLIDATION_UNAVAILABLE",
    );
  }
});
