import assert from "node:assert/strict";
import test from "node:test";
import { userId, type UserId } from "@kontave/organizations-domain";
import { ColorScheme, PreferencesFailure, type UserPreferences } from "@kontave/preferences-domain";
import { GetEffectiveUserPreferences, UpdateUserPreferences, type PreferencesClock, type UserPreferencesRepository } from "../src/index";

class MemoryRepository implements UserPreferencesRepository {
  value: UserPreferences | null = null;
  async findByUser(_userId: UserId): Promise<UserPreferences | null> { return this.value; }
  async save(preferences: UserPreferences, expectedVersion: number): Promise<UserPreferences> {
    if ((this.value?.version ?? 0) !== expectedVersion) throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "conflict");
    this.value = preferences; return preferences;
  }
}
const clock: PreferencesClock = { now: () => "2026-08-15T00:00:00.000Z" };

test("returns defaults without persisting on read", async () => {
  const repository = new MemoryRepository();
  const result = await new GetEffectiveUserPreferences(repository, clock).execute(userId("user-1"));
  assert.equal(result.version, 0);
  assert.equal(repository.value, null);
});

test("updates preferences with optimistic concurrency", async () => {
  const repository = new MemoryRepository();
  const update = new UpdateUserPreferences(repository, clock);
  const result = await update.execute({ userId: userId("user-1"), expectedVersion: 0, appearance: { colorScheme: ColorScheme.Dark } });
  assert.equal(result.appearance.colorScheme, ColorScheme.Dark);
  assert.equal(result.version, 1);
  await assert.rejects(() => update.execute({ userId: userId("user-1"), expectedVersion: 0 }), { code: "PREFERENCES_VERSION_CONFLICT" });
});
