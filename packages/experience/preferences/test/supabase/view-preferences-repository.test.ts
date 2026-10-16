import assert from "node:assert/strict";
import test from "node:test";
import { userId } from "@kontave/organizations/domain";
import { PreferencesFailure, type UserViewPreferences } from "../../src/domain";
import { SupabaseUserViewPreferencesRepository, type UserViewPreferencesRowSource } from "../../src/adapters/supabase";

const owner = userId("user-1");
const row = { user_id: owner, view_id: "sales.orders", hidden_field_ids: ["internal_note"], hidden_column_ids: ["created_at"], version: 2, updated_at: "2026-09-28T12:00:00.000Z" };

function source(overrides: Partial<UserViewPreferencesRowSource> = {}): UserViewPreferencesRowSource {
  return { find: async () => ({ data: row, error: null }), save: async () => ({ data: row, error: null }), ...overrides };
}

test("Supabase view repository validates owner and view scope before returning preferences", async () => {
  const repository = new SupabaseUserViewPreferencesRepository(source());
  const value = await repository.find(owner, "sales.orders");
  assert.deepEqual(value?.hiddenColumnIds, ["created_at"]);
  const foreign = new SupabaseUserViewPreferencesRepository(source({ find: async () => ({ data: { ...row, user_id: "another-user" }, error: null }) }));
  await assert.rejects(() => foreign.find(owner, "sales.orders"), { code: "PREFERENCES_INVALID" });
});

test("Supabase view repository maps revision conflict and validates its write response", async () => {
  const view: UserViewPreferences = { userId: owner, viewId: "sales.orders", hiddenFieldIds: [], hiddenColumnIds: [], version: 1, updatedAt: row.updated_at };
  const conflict = new SupabaseUserViewPreferencesRepository(source({ save: async () => ({ data: null, error: { code: "P0001", message: "PREFERENCES_VERSION_CONFLICT" } }) }));
  await assert.rejects(() => conflict.save(view, 0), { code: "PREFERENCES_VERSION_CONFLICT" });
  const wrongView = new SupabaseUserViewPreferencesRepository(source({ save: async () => ({ data: { ...row, view_id: "payroll.runs" }, error: null }) }));
  await assert.rejects(() => wrongView.save(view, 0), (error: unknown) => error instanceof PreferencesFailure && error.code === "PREFERENCES_INVALID");
});
