import assert from "node:assert/strict";
import test from "node:test";
import { userId } from "@kontave/organizations/domain";
import { PreferencesFailure, type UserProcessDefaults } from "../../src/domain";
import { GetEffectiveUserProcessDefaults, UpdateUserProcessDefaults, type UserProcessDefaultsRepository } from "../../src/application";

class MemoryRepository implements UserProcessDefaultsRepository {
  value: UserProcessDefaults | null = null;
  async find() { return this.value; }
  async save(value: UserProcessDefaults, expectedVersion: number) {
    if ((this.value?.version ?? 0) !== expectedVersion) throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "stale");
    this.value = value;
    return value;
  }
}
const owner = userId("process-defaults-user");
const clock = { now: () => "2026-09-29T00:00:00.000Z" };

test("process defaults are empty on first read and update under expected version", async () => {
  const repository = new MemoryRepository();
  const get = new GetEffectiveUserProcessDefaults(repository, clock);
  assert.deepEqual((await get.execute({ userId: owner, processId: "sales.invoice" })).values, {});
  assert.equal(repository.value, null);
  const update = new UpdateUserProcessDefaults(repository, clock);
  const saved = await update.execute({ userId: owner, processId: "sales.invoice", expectedVersion: 0, values: { customer: "client-1" } });
  assert.equal(saved.version, 1);
  await assert.rejects(() => update.execute({ userId: owner, processId: "sales.invoice", expectedVersion: 0, values: {} }), { code: "PREFERENCES_VERSION_CONFLICT" });
});
