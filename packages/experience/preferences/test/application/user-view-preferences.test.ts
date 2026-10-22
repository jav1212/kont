import assert from "node:assert/strict";
import test from "node:test";
import { userId, type UserId } from "@kontave/organizations/domain";
import { PreferencesFailure, type UserViewPreferences } from "../../src/domain";
import { GetEffectiveUserViewPreferences, UpdateUserViewPreferences, type UserViewPreferencesRepository } from "../../src/application";

const owner = userId("user-1");
const timestamp = "2026-09-28T12:00:00.000Z";

class MemoryRepository implements UserViewPreferencesRepository {
  readonly rows = new Map<string, UserViewPreferences>();
  async find(_userId: UserId, viewId: string): Promise<UserViewPreferences | null> { return this.rows.get(viewId) ?? null; }
  async save(value: UserViewPreferences, expectedVersion: number): Promise<UserViewPreferences> {
    const current = this.rows.get(value.viewId);
    if ((current?.version ?? 0) !== expectedVersion) throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "stale");
    this.rows.set(value.viewId, value);
    return value;
  }
}

const clock = { now: () => timestamp };

test("view reads return all-visible defaults without inserting a row", async () => {
  const repository = new MemoryRepository();
  const value = await new GetEffectiveUserViewPreferences(repository, clock).execute({ userId: owner, viewId: "inventory.products" });
  assert.deepEqual(value.hiddenFieldIds, []);
  assert.deepEqual(value.hiddenColumnIds, []);
  assert.equal(value.version, 0);
  assert.equal(repository.rows.size, 0);
});

test("field and column visibility updates merge independently with optimistic revisions", async () => {
  const repository = new MemoryRepository();
  const update = new UpdateUserViewPreferences(repository, clock);
  const first = await update.execute({ userId: owner, viewId: "sales.orders", expectedVersion: 0, hiddenFieldIds: ["internal_note"] });
  const second = await update.execute({ userId: owner, viewId: "sales.orders", expectedVersion: 1, hiddenColumnIds: ["created_at"] });
  assert.deepEqual(second.hiddenFieldIds, ["internal_note"]);
  assert.deepEqual(second.hiddenColumnIds, ["created_at"]);
  assert.equal(second.version, 2);
  await assert.rejects(() => update.execute({ userId: owner, viewId: "sales.orders", expectedVersion: 1, hiddenFieldIds: [] }),
    { code: "PREFERENCES_VERSION_CONFLICT" });
  assert.equal(first.version, 1);
});

test("view updates reject empty patches and invalid screen definitions before saving", async () => {
  const repository = new MemoryRepository();
  const update = new UpdateUserViewPreferences(repository, clock);
  await assert.rejects(() => update.execute({ userId: owner, viewId: "sales.orders", expectedVersion: 0 }), { code: "PREFERENCES_INVALID" });
  await assert.rejects(() => update.execute({ userId: owner, viewId: "../other-tenant", expectedVersion: 0, hiddenFieldIds: ["secret"] }), { code: "PREFERENCES_INVALID" });
  assert.equal(repository.rows.size, 0);
});
