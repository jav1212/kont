import assert from "node:assert/strict";
import test from "node:test";
import { userId } from "@kontave/organizations/domain";
import type { UserProcessDefaults } from "../../src/domain";
import { GetEffectiveUserNavigationLabels, UpdateUserNavigationLabels, type UserProcessDefaultsRepository } from "../../src/application";

class MemoryRepository implements UserProcessDefaultsRepository {
  value: UserProcessDefaults | null = null;
  async find(_userId: string, processId: string) { assert.equal(processId, "navigation.menu"); return this.value; }
  async save(value: UserProcessDefaults, expectedVersion: number) {
    if ((this.value?.version ?? 0) !== expectedVersion) throw new Error("stale");
    this.value = value;
    return value;
  }
}
const owner = userId("navigation-label-owner");
const clock = { now: () => "2026-09-29T00:00:00.000Z" };

test("navigation labels resolve defaults without writing and persist with optimistic revisions", async () => {
  const repository = new MemoryRepository();
  const get = new GetEffectiveUserNavigationLabels(repository, clock);
  assert.deepEqual((await get.execute(owner)).labels, {});
  assert.equal(repository.value, null);

  const update = new UpdateUserNavigationLabels(repository, clock);
  const saved = await update.execute({ userId: owner, expectedVersion: 0, labels: { sales: " Comercial ", "inventory.products": "Artículos" } });
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.labels, { sales: "Comercial", "inventory.products": "Artículos" });
  await assert.rejects(() => update.execute({ userId: owner, expectedVersion: 0, labels: {} }), { code: "PREFERENCES_VERSION_CONFLICT" });

  const reset = await update.execute({ userId: owner, expectedVersion: 1, labels: {} });
  assert.equal(reset.version, 2);
  assert.deepEqual(reset.labels, {});
});

test("unknown menu IDs and invalid labels fail before persistence", async () => {
  const repository = new MemoryRepository();
  const update = new UpdateUserNavigationLabels(repository, clock);
  await assert.rejects(() => update.execute({ userId: owner, expectedVersion: 0, labels: { "unknown.menu": "Otra" } }), { code: "PREFERENCES_INVALID" });
  await assert.rejects(() => update.execute({ userId: owner, expectedVersion: 0, labels: { sales: " " } }), { code: "PREFERENCES_INVALID" });
  assert.equal(repository.value, null);
});
