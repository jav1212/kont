import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseInventoryOperationsRepository } from "../../src/adapters/supabase";
import { InventoryFailure } from "../../src/domain";

const scope = {
  actorUserId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  companyId: "J-12345678-9",
};

const operation = {
  id: "operation-1",
  companyId: "J-12345678-9",
  reason: "opening_balance",
  effectiveDate: "2026-08-16",
  status: "draft",
  version: 1,
  source: { kind: "inventory", documentId: "operation-1" },
  reference: null,
  notes: null,
  postedAt: null,
  reversalOf: null,
  reversedBy: null,
  lines: [{
    id: "line-1",
    productId: "product-1",
    productName: "Producto",
    productSku: "P-1",
    direction: "inbound",
    quantity: { value: "2.5", unit: "each" },
    unitCost: { amount: "10.25", currency: "VES" },
    movementId: null,
  }],
  capabilities: { canPost: true, canReverse: false, canEditMetadata: true },
};

function repository(
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>,
): SupabaseInventoryOperationsRepository {
  return new SupabaseInventoryOperationsRepository({ rpc } as never);
}

test("maps every inventory operation command with actor, organization, company, and optimistic version", async () => {
  const requests: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = repository(async (name, args) => {
    requests.push({ name, args });
    return { data: operation, error: null };
  });

  await client.create({
    ...scope,
    reason: "opening_balance",
    effectiveDate: "2026-08-16",
    reference: "  apertura ",
    notes: null,
    lines: [{ productId: "product-1", direction: "inbound", quantity: "2.5", unit: "each", unitCost: "10.25" }],
  } as never);
  await client.get({ ...scope, operationId: "operation-1" } as never);
  await client.update({ ...scope, operationId: "operation-1", expectedVersion: 1, reference: null } as never);
  await client.post({ ...scope, operationId: "operation-1", expectedVersion: 1 } as never);
  await client.reverse({
    ...scope,
    operationId: "operation-1",
    expectedVersion: 2,
    effectiveDate: "2026-08-17",
    reason: "Corrección",
  } as never);

  assert.deepEqual(requests.map(({ name }) => name), [
    "create_native_inventory_operation",
    "get_native_inventory_operation",
    "update_native_inventory_operation",
    "post_native_inventory_operation",
    "reverse_native_inventory_operation",
  ]);
  for (const request of requests) {
    assert.equal(request.args.p_actor_user_id, scope.actorUserId);
    assert.equal(request.args.p_organization_id, scope.organizationId);
    assert.equal(request.args.p_company_id, scope.companyId);
  }
  assert.deepEqual(requests[0]?.args.p_lines, [{
    productId: "product-1", direction: "inbound", quantity: "2.5", unit: "each", unitCost: "10.25",
  }]);
  assert.equal(requests[1]?.args.p_operation_id, "operation-1");
  assert.deepEqual(requests[2]?.args.p_changes, { reference: null });
  assert.equal(requests[3]?.args.p_expected_version, 1);
  assert.equal(requests[4]?.args.p_expected_version, 2);
});

test("maps flow filters and leaves omitted filters as SQL null", async () => {
  let request: { name: string; args: Record<string, unknown> } | undefined;
  const client = repository(async (name, args) => {
    request = { name, args };
    return {
      data: {
        items: [], nextCursor: null, total: 0,
        summary: { movementCount: 0, totalValue: { amount: "0", currency: "VES" }, quantities: [] },
      },
      error: null,
    };
  });
  await client.list({ ...scope, from: "2026-08-01", to: "2026-08-31", limit: 25 } as never);
  assert.equal(request?.name, "list_native_inventory_flows");
  assert.equal(request?.args.p_direction, null);
  assert.equal(request?.args.p_reason, null);
  assert.equal(request?.args.p_cursor, null);
  assert.equal(request?.args.p_limit, 25);
});

test("maps authoritative RPC conflict and tenant-access failures to stable inventory failures", async () => {
  for (const [message, code] of [
    ["INVENTORY_OPERATION_VERSION_CONFLICT", "INVENTORY_OPERATION_VERSION_CONFLICT"],
    ["INVENTORY_OPERATION_ACCESS_DENIED", "INVENTORY_OPERATION_ACCESS_DENIED"],
  ] as const) {
    const client = repository(async () => ({ data: null, error: { message } }));
    await assert.rejects(
      () => client.post({ ...scope, operationId: "operation-1", expectedVersion: 1 } as never),
      (error: unknown) => error instanceof InventoryFailure && error.code === code,
    );
  }
});

test("rejects malformed RPC details instead of exposing unvalidated persistence data", async () => {
  const client = repository(async () => ({ data: { ...operation, version: "1" }, error: null }));
  await assert.rejects(
    () => client.get({ ...scope, operationId: "operation-1" } as never),
    (error: unknown) => error instanceof InventoryFailure && error.code === "INVENTORY_REPOSITORY_UNAVAILABLE",
  );
});
