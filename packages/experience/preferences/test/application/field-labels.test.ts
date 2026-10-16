import assert from "node:assert/strict";
import test from "node:test";
import { userId } from "@kontave/organizations/domain";
import { PreferencesFailure, type UserProcessDefaults } from "../../src/domain";
import { GetEffectiveUserFieldLabels, UpdateUserFieldLabels, type UserProcessDefaultsRepository } from "../../src/application";

class MemoryRepository implements UserProcessDefaultsRepository {
  readonly values = new Map<string, UserProcessDefaults>();
  async find(owner: string, processId: string) { return this.values.get(`${owner}:${processId}`) ?? null; }
  async save(value: UserProcessDefaults, expectedVersion: number) {
    const key = `${value.userId}:${value.processId}`;
    if ((this.values.get(key)?.version ?? 0) !== expectedVersion) throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "stale");
    this.values.set(key, value);
    return value;
  }
}
const owner = userId("field-label-owner");
const clock = { now: () => "2026-09-29T00:00:00.000Z" };

test("field labels resolve empty defaults, update by view, and replace with optimistic revisions", async () => {
  const repository = new MemoryRepository();
  const get = new GetEffectiveUserFieldLabels(repository, clock);
  assert.deepEqual((await get.execute({ userId: owner, viewId: "sales.invoice" })).labels, {});
  assert.equal(repository.values.size, 0);

  const update = new UpdateUserFieldLabels(repository, clock);
  const saved = await update.execute({ userId: owner, viewId: "sales.invoice", expectedVersion: 0, labels: { customer: "  Comprador  ", "invoice.customer-name": "Razón social" } });
  assert.deepEqual(saved.labels, { customer: "Comprador", "invoice.customer-name": "Razón social" });
  assert.equal(saved.version, 1);
  assert.deepEqual((await get.execute({ userId: owner, viewId: "inventory.products" })).labels, {});

  await assert.rejects(() => update.execute({ userId: owner, viewId: "sales.invoice", expectedVersion: 0, labels: {} }), { code: "PREFERENCES_VERSION_CONFLICT" });
  const reset = await update.execute({ userId: owner, viewId: "sales.invoice", expectedVersion: 1, labels: {} });
  assert.deepEqual(reset.labels, {});
  assert.equal(reset.version, 2);
});

test("field labels reject invalid IDs, unsafe values, excessive count, and malformed views before writing", async () => {
  const repository = new MemoryRepository();
  const update = new UpdateUserFieldLabels(repository, clock);
  const invalid = [
    { "Bad Field": "Nombre" },
    { customer: " " },
    { customer: "x".repeat(61) },
    { customer: "nombre\n" },
    Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`field${index}`, "Nombre"])),
  ];
  for (const labels of invalid) {
    await assert.rejects(() => update.execute({ userId: owner, viewId: "sales.invoice", expectedVersion: 0, labels }), { code: "PREFERENCES_INVALID" });
  }
  await assert.rejects(() => update.execute({ userId: owner, viewId: "Sales Invoice", expectedVersion: 0, labels: {} }), { code: "PREFERENCES_INVALID" });
  assert.equal(repository.values.size, 0);
});
