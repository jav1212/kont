import assert from "node:assert/strict";
import test from "node:test";
import { userId } from "@kontave/organizations/domain";
import { PreferencesFailure, createUserViewPreferences, defaultUserViewPreferences } from "../../src/domain";

const owner = userId("user-1");
const timestamp = "2026-09-28T12:00:00.000Z";

test("view preferences canonicalize immutable hidden identifiers and default to all visible", () => {
  const value = createUserViewPreferences({
    userId: owner, viewId: "inventory.products", hiddenFieldIds: ["tax_id", "address"], hiddenColumnIds: ["created_at"], version: 2, updatedAt: timestamp,
  });
  assert.deepEqual(value.hiddenFieldIds, ["address", "tax_id"]);
  assert.deepEqual(value.hiddenColumnIds, ["created_at"]);
  assert.equal(Object.isFrozen(value.hiddenFieldIds), true);
  assert.deepEqual(defaultUserViewPreferences(owner, "inventory.products", timestamp).hiddenFieldIds, []);
});

test("view preferences reject duplicate, unbounded and malformed identifiers", () => {
  for (const input of [
    { viewId: "../admin", fieldIds: [] },
    { viewId: "payroll.run", fieldIds: ["salary", "salary"] },
    { viewId: "sales.orders", fieldIds: Array.from({ length: 101 }, (_, index) => `field_${index}`) },
    { viewId: "sales.orders", fieldIds: ["Contains spaces"] },
  ]) {
    assert.throws(() => createUserViewPreferences({
      userId: owner, viewId: input.viewId, hiddenFieldIds: input.fieldIds, hiddenColumnIds: [], version: 0, updatedAt: timestamp,
    }), (error: unknown) => error instanceof PreferencesFailure && error.code === "PREFERENCES_INVALID");
  }
});
