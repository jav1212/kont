import assert from "node:assert/strict";
import test from "node:test";
import { userId } from "@kontave/organizations-domain";
import { ColorScheme, InterfaceDensity, PreferencesFailure, createUserPreferences, defaultUserPreferences } from "../src/index";

test("creates portable defaults without platform storage knowledge", () => {
  const preferences = defaultUserPreferences(userId("user-1"), "2026-08-15T00:00:00.000Z");
  assert.equal(preferences.appearance.colorScheme, ColorScheme.System);
  assert.equal(preferences.appearance.density, InterfaceDensity.Comfortable);
  assert.equal(preferences.regional.locale, "es-VE");
  assert.equal(preferences.version, 0);
});

test("rejects invalid persisted preferences", () => {
  assert.throws(() => createUserPreferences({
    ...defaultUserPreferences(userId("user-1"), "2026-08-15T00:00:00.000Z"),
    updatedAt: "invalid",
  }), (failure) => failure instanceof PreferencesFailure && failure.code === "PREFERENCES_INVALID");
});
