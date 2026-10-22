import assert from "node:assert/strict";
import test from "node:test";
import { createUserProcessDefaults, defaultUserProcessDefaults } from "../../src/domain";
import { userId } from "@kontave/organizations/domain";

test("process defaults are sparse, canonical and immutable", () => {
  const owner = userId("user-process-defaults");
  const value = createUserProcessDefaults({ userId: owner, processId: "sales.invoice", values: { customer: "c-1", enabled: true }, version: 1, updatedAt: "2026-09-29T00:00:00.000Z" });
  assert.deepEqual(Object.keys(value.values), ["customer", "enabled"]);
  assert.equal(Object.isFrozen(value.values), true);
  assert.equal(defaultUserProcessDefaults(owner, "sales.invoice", "2026-09-29T00:00:00.000Z").version, 0);
});

test("process defaults reject invalid keys, nested values, non-finite values, and excess entries", () => {
  const base = { userId: userId("user-process-defaults"), processId: "sales.invoice", version: 0, updatedAt: "2026-09-29T00:00:00.000Z" };
  assert.throws(() => createUserProcessDefaults({ ...base, values: { "Bad Key": "x" } }), { code: "PREFERENCES_INVALID" });
  assert.throws(() => createUserProcessDefaults({ ...base, values: { customer: { id: "x" } as never } }), { code: "PREFERENCES_INVALID" });
  assert.throws(() => createUserProcessDefaults({ ...base, values: { rate: Number.NaN } }), { code: "PREFERENCES_INVALID" });
  assert.throws(() => createUserProcessDefaults({ ...base, values: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`field${i}`, "x"])) }), { code: "PREFERENCES_INVALID" });
});
