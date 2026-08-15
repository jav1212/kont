import type { PreferencesClock, UserPreferencesRepository } from "@kontave/preferences-application";
import { PreferencesFailure, defaultUserPreferences, type UserPreferences } from "@kontave/preferences-domain";
import { userId, type UserId } from "@kontave/organizations-domain";

export class InMemoryUserPreferencesRepository implements UserPreferencesRepository {
  private readonly values = new Map<UserId, UserPreferences>();
  async findByUser(id: UserId): Promise<UserPreferences | null> { return this.values.get(id) ?? null; }
  async save(preferences: UserPreferences, expectedVersion: number): Promise<UserPreferences> {
    if ((this.values.get(preferences.userId)?.version ?? 0) !== expectedVersion) throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "Preferences changed.");
    this.values.set(preferences.userId, preferences); return preferences;
  }
  seed(preferences: UserPreferences): void { this.values.set(preferences.userId, preferences); }
}

export class FixedPreferencesClock implements PreferencesClock {
  constructor(private value = "2026-08-15T00:00:00.000Z") {}
  now(): string { return this.value; }
  set(value: string): void { this.value = value; }
}

export function userPreferencesFixture(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return { ...defaultUserPreferences(userId("user-fixture"), "2026-08-15T00:00:00.000Z"), ...overrides };
}
