import assert from "node:assert/strict";
import test from "node:test";
import { userId } from "@kontave/organizations/domain";
import { PreferencesFailure, defaultUserPreferences } from "../../src/domain";
import {
  SupabaseUserPreferencesRepository,
  type PreferencesRowSource,
} from "../../src/adapters/supabase";

const ownerId = userId("user-1");
const row = {
  user_id: ownerId,
  color_scheme: "system",
  density: "comfortable",
  locale: "es-VE",
  time_zone: "America/Caracas",
  version: 1,
  updated_at: "2026-08-15T00:00:00.000Z",
};

function source(overrides: Partial<PreferencesRowSource> = {}): PreferencesRowSource {
  return {
    findByUser: async () => ({ data: row, error: null }),
    save: async () => ({ data: row, error: null }),
    ...overrides,
  };
}

test("loads and decodes preferences owned by the expected user", async () => {
  const repository = new SupabaseUserPreferencesRepository(source());
  const preferences = await repository.findByUser(ownerId);
  assert.equal(preferences?.regional.timeZone, "America/Caracas");
});

test("rejects a structurally valid row owned by another user", async () => {
  const repository = new SupabaseUserPreferencesRepository(source({
    findByUser: async () => ({ data: { ...row, user_id: "another-user" }, error: null }),
  }));
  await assert.rejects(
    repository.findByUser(ownerId),
    (cause) => cause instanceof PreferencesFailure && cause.code === "PREFERENCES_INVALID",
  );
});

test("preserves the optimistic-concurrency failure classification", async () => {
  const repository = new SupabaseUserPreferencesRepository(source({
    save: async () => ({ data: null, error: { code: "P0001", message: "PREFERENCES_VERSION_CONFLICT" } }),
  }));
  await assert.rejects(
    repository.save(defaultUserPreferences(ownerId, "2026-08-15T00:00:00.000Z"), 0),
    (cause) => cause instanceof PreferencesFailure && cause.code === "PREFERENCES_VERSION_CONFLICT",
  );
});

test("wraps rejected row-source promises as typed repository failures", async () => {
  const repository = new SupabaseUserPreferencesRepository(source({
    findByUser: async () => { throw new Error("network unavailable"); },
  }));
  await assert.rejects(
    repository.findByUser(ownerId),
    (cause) => cause instanceof PreferencesFailure
      && cause.code === "PREFERENCES_REPOSITORY_UNAVAILABLE"
      && cause.cause instanceof Error,
  );
});
