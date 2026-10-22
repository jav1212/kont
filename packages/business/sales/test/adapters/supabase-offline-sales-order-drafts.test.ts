import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfflineSalesDraftSessionActorResolver } from "../../src/application/offline-sales-drafts";
import { SupabaseOfflineSalesOrderDraftGateway } from "../../src/adapters/supabase/offline-sales-order-drafts";
import { userId } from "@kontave/organizations/domain";

const actor = userId("7b12e42d-3945-4d34-a035-feb773b50001");
const binding = {
  operationId: "33333333-3333-4333-8333-333333333333",
  actorUserId: actor,
  organizationId: "8e2403ad-a266-4ffc-8680-b744f241001e" as never,
  companyId: "J-12345678-9" as never,
  branchId: "6be10ba0-d5d3-4a61-a34f-73d0c81a2345",
};
const payload = {
  version: 1, customerId: "customer-1", customerUpdatedAt: "2026-10-01T12:00:00.000Z",
  orderDate: "2026-10-01", currencyCode: "VES", lines: [{ productId: "product-1", quantity: "1", expectedPricingVersion: 1, expectedUnitPrice: "10" }],
} as const;
class Session implements OfflineSalesDraftSessionActorResolver {
  constructor(private readonly actorValue: typeof actor | null) {}
  async resolveActorUserId() { return this.actorValue; }
}

test("server gateway compares the trusted session actor then sends the typed intent to the fixed RPC", async () => {
  let name = ""; let args: Record<string, unknown> | undefined;
  const client = { rpc: async (rpcName: string, rpcArgs: Record<string, unknown>) => {
    name = rpcName; args = rpcArgs; return { data: { draftId: binding.operationId, replayed: false }, error: null };
  } } as unknown as SupabaseClient;
  const result = await new SupabaseOfflineSalesOrderDraftGateway(client, new Session(actor)).createDraft({ ...binding, payload });
  assert.deepEqual(result, { kind: "synced", serverDraftId: binding.operationId });
  assert.equal(name, "create_native_offline_sales_order_draft");
  assert.equal(args?.p_actor_user_id, actor);
  assert.equal(args?.p_operation_id, binding.operationId);
  assert.deepEqual(args?.p_payload, { ...payload, lines: [{ ...payload.lines[0], quantity: "1", expectedUnitPrice: "10" }] });
});

test("server gateway retries a malformed or foreign RPC success response", async () => {
  const client = { rpc: async () => ({ data: { draftId: "other-operation", replayed: false }, error: null }) } as unknown as SupabaseClient;
  const result = await new SupabaseOfflineSalesOrderDraftGateway(client, new Session(actor)).createDraft({ ...binding, payload });
  assert.deepEqual(result, { kind: "retry" });
});

test("server gateway blocks actor mismatch and never lets malformed payload reach Supabase", async () => {
  let calls = 0;
  const client = { rpc: async () => { calls += 1; return { data: null, error: null }; } } as unknown as SupabaseClient;
  const mismatched = new SupabaseOfflineSalesOrderDraftGateway(client, new Session(userId("00000000-0000-4000-8000-000000000001")));
  assert.deepEqual(await mismatched.createDraft({ ...binding, payload }), { kind: "blocked", code: "authorization_revoked" });
  const validSession = new SupabaseOfflineSalesOrderDraftGateway(client, new Session(actor));
  assert.deepEqual(await validSession.createDraft({ ...binding, payload: { body: "old shape" } }), { kind: "rejected", code: "validation_failed" });
  assert.equal(calls, 0);
});

test("server gateway turns known RPC outcomes into durable settlements and transport ambiguity into retry", async () => {
  const outcomes = [
    "ORGANIZATIONAL_USER_ACCESS_DENIED",
    "SALES_OFFLINE_DRAFT_BRANCH_UNAVAILABLE",
    "SALES_OFFLINE_DRAFT_SOURCE_CHANGED",
    "SALES_OFFLINE_DRAFT_VALIDATION_FAILED",
    "SALES_OFFLINE_DRAFT_IDEMPOTENCY_CONFLICT",
    "connection reset",
  ];
  for (const message of outcomes) {
    const client = { rpc: async () => ({ data: null, error: { message } }) } as unknown as SupabaseClient;
    const result = await new SupabaseOfflineSalesOrderDraftGateway(client, new Session(actor)).createDraft({ ...binding, payload });
    const expected = message.includes("ORGANIZATIONAL") ? { kind: "blocked", code: "authorization_revoked" }
      : message.includes("BRANCH") ? { kind: "blocked", code: "branch_unavailable" }
      : message.includes("SOURCE") ? { kind: "blocked", code: "source_changed" }
      : message.includes("VALIDATION") ? { kind: "rejected", code: "validation_failed" }
      : message.includes("IDEMPOTENCY") ? { kind: "rejected", code: "idempotency_conflict" } : { kind: "retry" };
    assert.deepEqual(result, expected);
  }
});
