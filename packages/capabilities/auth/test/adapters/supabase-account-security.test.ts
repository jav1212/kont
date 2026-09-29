import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseAccountSecurityRepository } from "../../src/adapters/supabase";

const scope = { organizationId: "organization-1", userId: "user-1" };
const row = { organization_id: scope.organizationId, user_id: scope.userId, password_changed_at: "2026-09-01T00:00:00.000Z", last_authenticated_at: "2026-09-20T00:00:00.000Z", failed_attempts: [], locked_until: null, version: 1, policy_version: 1 };

test("Supabase account security retries a local transition after CAS conflict", async () => {
  let reads = 0; let commits = 0;
  const client = { rpc: async (name: string) => {
    if (name === "account_security_read_state") return { data: { ...row, version: ++reads }, error: null };
    commits += 1; return commits === 1 ? { data: false, error: null } : { data: true, error: null };
  } };
  const repository = new SupabaseAccountSecurityRepository(client as never, 2);
  const value = await repository.transact(scope, (state) => ({ state, result: "committed" }));
  assert.equal(value, "committed");
  assert.equal(reads, 2);
  assert.equal(commits, 2);
});

test("Supabase account security rejects malformed state rows before a CAS write", async () => {
  let committed = false;
  const client = { rpc: async (name: string) => name === "account_security_read_state"
    ? { data: { ...row, failed_attempts: "bad" }, error: null }
    : (committed = true, { data: true, error: null }) };
  const repository = new SupabaseAccountSecurityRepository(client as never, 1);
  await assert.rejects(() => repository.transact(scope, (state) => ({ state, result: null })), { code: "PROVIDER_UNAVAILABLE" });
  assert.equal(committed, false);
});
