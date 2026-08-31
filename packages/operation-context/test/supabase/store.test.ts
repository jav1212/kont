import assert from "node:assert/strict";
import test from "node:test";
import { companyId, organizationId, userId } from "@kontave/organizations/domain";
import { OperationContextFailure, type OperationContextKey, type OperationalDefaults } from "../../src/domain";
import {
  SupabaseOperationContextStore,
  type DatabaseError,
  type OperationContextRowSource,
} from "../../src/adapters/supabase";

const key: OperationContextKey = {
  userId: userId("user"),
  organizationId: organizationId("organization"),
  companyId: companyId("company"),
};

const row = {
  user_id: key.userId,
  organization_id: key.organizationId,
  company_id: key.companyId,
  effective_date: "2026-08-16",
  presentation_currency: "VES",
  selected_rate: { status: "unavailable", effectiveDate: "2026-08-16" },
  version: 1,
  updated_at: "2026-08-16T12:00:00.000Z",
};

function source(overrides: Partial<OperationContextRowSource> = {}): OperationContextRowSource {
  return {
    load: async () => ({ data: row, error: null }),
    save: async () => ({ data: row, error: null }),
    clear: async () => ({ error: null }),
    ...overrides,
  };
}

test("loads and validates a row scoped to the expected operation-context key", async () => {
  const store = new SupabaseOperationContextStore(source());
  const value = await store.load(key);
  assert.equal(value?.version, 1);
  assert.equal(value?.exchangeRate.status, "unavailable");
});

test("rejects a valid row that belongs to another operation-context key", async () => {
  const store = new SupabaseOperationContextStore(source({
    load: async () => ({ data: { ...row, company_id: "another-company" }, error: null }),
  }));
  await assert.rejects(
    store.load(key),
    (cause) => cause instanceof OperationContextFailure && cause.code === "OPERATION_CONTEXT_ACCESS_DENIED",
  );
});

test("translates optimistic concurrency errors to a stable failure code", async () => {
  const conflict: DatabaseError = { message: "operation_context_version_conflict" };
  const store = new SupabaseOperationContextStore(source({
    save: async () => ({ data: null, error: conflict }),
  }));
  await assert.rejects(
    store.save({ key } as OperationalDefaults, 1),
    (cause) => cause instanceof OperationContextFailure && cause.code === "OPERATION_CONTEXT_VERSION_CONFLICT",
  );
});

test("wraps rejected row-source promises as typed repository failures", async () => {
  const store = new SupabaseOperationContextStore(source({
    load: async () => { throw new Error("network unavailable"); },
  }));
  await assert.rejects(
    store.load(key),
    (cause) => cause instanceof OperationContextFailure
      && cause.code === "OPERATION_CONTEXT_REPOSITORY_UNAVAILABLE"
      && cause.cause instanceof Error,
  );
});
