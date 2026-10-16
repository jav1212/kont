import assert from "node:assert/strict";
import test from "node:test";
import { userId } from "@kontave/organizations/domain";
import type { UserProcessDefaults } from "../../src/domain";
import { GetEffectiveUserNavigationIcons, UpdateUserNavigationIcons, type UserProcessDefaultsRepository } from "../../src/application";

class MemoryRepository implements UserProcessDefaultsRepository {
  value: UserProcessDefaults | null = null;

  async find(_userId: string, processId: string) {
    assert.equal(processId, "navigation.icons");
    return this.value;
  }

  async save(value: UserProcessDefaults, expectedVersion: number) {
    if ((this.value?.version ?? 0) !== expectedVersion) throw new Error("stale");
    this.value = value;
    return value;
  }
}

const owner = userId("navigation-icon-owner");
const clock = { now: () => "2026-09-29T00:00:00.000Z" };

test("navigation icons resolve defaults without writing and persist with optimistic revisions", async () => {
  const repository = new MemoryRepository();
  const get = new GetEffectiveUserNavigationIcons(repository, clock);
  assert.deepEqual((await get.execute(owner)).icons, {});
  assert.equal(repository.value, null);

  const update = new UpdateUserNavigationIcons(repository, clock);
  const saved = await update.execute({
    userId: owner,
    expectedVersion: 0,
    icons: { sales: "shopping-cart", "inventory.products": "package" },
  });
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.icons, { sales: "shopping-cart", "inventory.products": "package" });
  await assert.rejects(
    () => update.execute({ userId: owner, expectedVersion: 0, icons: {} }),
    { code: "PREFERENCES_VERSION_CONFLICT" },
  );

  const reset = await update.execute({ userId: owner, expectedVersion: 1, icons: {} });
  assert.equal(reset.version, 2);
  assert.deepEqual(reset.icons, {});
});

test("unknown destinations and platform icon names fail before persistence", async () => {
  const repository = new MemoryRepository();
  const update = new UpdateUserNavigationIcons(repository, clock);
  await assert.rejects(
    () => update.execute({ userId: owner, expectedVersion: 0, icons: { "unknown.destination": "shopping-cart" } }),
    { code: "PREFERENCES_INVALID" },
  );
  await assert.rejects(
    () => update.execute({ userId: owner, expectedVersion: 0, icons: { sales: "cart-outline" } }),
    { code: "PREFERENCES_INVALID" },
  );
  assert.equal(repository.value, null);
});
