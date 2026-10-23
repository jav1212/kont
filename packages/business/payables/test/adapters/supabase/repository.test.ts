import assert from "node:assert/strict";
import test from "node:test";
import { SupabasePayablesRepository, type PayablesSupabaseClient } from "../../../src/adapters/supabase";
import { PayablesFailure } from "../../../src/domain";

test("payables adapter scopes commands to the trusted RPC boundary", async () => {
  let call: { readonly name: string; readonly args: Record<string, unknown> } | undefined;
  const client: PayablesSupabaseClient = {
    async rpc(name, args) {
      call = { name, args };
      return { data: { commandId: "document-1", replayed: false, affectedIds: ["document-1"], versions: { "document-1": 1 } }, error: null };
    },
  };
  const repository = new SupabasePayablesRepository(client);
  const result = await repository.execute({ tenantId: "tenant", organizationId: "org", companyId: "company", actorId: "actor" }, {
    tenantId: "tenant", organizationId: "org", companyId: "company", actorId: "actor",
    kind: "create_manual_document", idempotencyKey: "key", correlationId: "correlation", documentId: "document-1", supplierId: "supplier-1",
    documentNumber: "F-1", concept: "Servicio", issuedAt: "2026-10-01", dueAt: "2026-10-30", currency: "VES", principal: "10.00",
    rateSnapshot: { amount: "10.00", baseCurrency: "VES", rate: "1", source: "identity", effectiveDate: "2026-10-01", policyVersion: "v1", rounding: "half_up" },
  });
  assert.equal(call?.name, "shared_payables_execute_command");
  assert.equal(result.commandId, "document-1");
});

test("payables adapter maps expected SQL conflicts", async () => {
  const client: PayablesSupabaseClient = { async rpc() { return { data: null, error: { message: "PAYABLES_VERSION_CONFLICT" } }; } };
  const repository = new SupabasePayablesRepository(client);
  await assert.rejects(() => repository.execute({ tenantId: "tenant", organizationId: "org", companyId: "company", actorId: "actor" }, {
    tenantId: "tenant", organizationId: "org", companyId: "company", actorId: "actor",
    kind: "change_due_date", idempotencyKey: "key", correlationId: "correlation", changeId: "change", documentId: "document", dueAt: "2026-10-30", reason: "Cambio de acuerdo", expectedVersion: 1,
  }), (error: unknown) => error instanceof PayablesFailure && error.code === "VERSION_CONFLICT");
});

test("payment batch commands use their own idempotent RPC and accept version-only receipts", async () => {
  let rpcName = "";
  const client: PayablesSupabaseClient = { async rpc(name) { rpcName = name; return { data: { commandId: "batch-1", affectedIds: ["batch-1"], status: "submitted", version: 2, replayed: false }, error: null }; } };
  const repository = new SupabasePayablesRepository(client);
  const receipt = await repository.execute({ tenantId: "tenant", organizationId: "org", companyId: "company", actorId: "actor" }, {
    tenantId: "tenant", organizationId: "org", companyId: "company", actorId: "actor", kind: "submit_payment_batch",
    idempotencyKey: "batch-key", correlationId: "trace", batchId: "batch-1", expectedVersion: 1,
  });
  assert.equal(rpcName, "shared_payables_batch_command");
  assert.deepEqual(receipt.versions, {});
});

test("report queries use the stable reporting RPC and forward scope and filters", async () => {
  let call: { name: string; args: Record<string, unknown> } | undefined;
  const client: PayablesSupabaseClient = { async rpc(name, args) { call = { name, args }; return { data: { rows: [{ documentId: "d-1", balance: "25" }], total: 1, asOf: "2026-10-23" }, error: null }; } };
  const repository = new SupabasePayablesRepository(client);
  const result = await repository.report({ tenantId: "tenant", organizationId: "org", companyId: "company", actorId: "actor", kind: "aging", supplierId: "supplier", asOf: "2026-10-23", limit: 20, offset: 0 });
  assert.equal(call?.name, "shared_payables_reporting_query");
  assert.deepEqual(call?.args.p_query, { kind: "aging", supplierId: "supplier", documentId: null, asOf: "2026-10-23", from: null, to: null, status: null, limit: 20, offset: 0 });
  assert.equal(result.rows.length, 1);
});
