import type { PreferencesClock, UserPreferencesRepository } from "@kontave/preferences-application";
import { PreferencesFailure, defaultUserPreferences, type UserPreferences } from "@kontave/preferences-domain";
import { userId, type UserId } from "@kontave/organizations/domain";

/** Deterministic in-memory preferences repository for application tests. */
export class InMemoryUserPreferencesRepository implements UserPreferencesRepository {
  private readonly values = new Map<UserId, UserPreferences>();

  /**
   * Loads seeded preferences for a user.
   *
   * @param id - Preferences owner.
   * @returns The stored snapshot, or `null` when absent.
   */
  async findByUser(id: UserId): Promise<UserPreferences | null> { return this.values.get(id) ?? null; }

  /**
   * Saves preferences when the in-memory version matches.
   *
   * @param preferences - Snapshot to store.
   * @param expectedVersion - Version that must currently be stored.
   * @returns The stored snapshot.
   * @throws {PreferencesFailure} When the expected version does not match.
   */
  async save(preferences: UserPreferences, expectedVersion: number): Promise<UserPreferences> {
    if ((this.values.get(preferences.userId)?.version ?? 0) !== expectedVersion) throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "Preferences changed.");
    this.values.set(preferences.userId, preferences); return preferences;
  }
  /**
   * Seeds a snapshot without a concurrency check.
   *
   * @param preferences - Snapshot to place in the repository.
   * @returns Nothing after updating the test double.
   */
  seed(preferences: UserPreferences): void { this.values.set(preferences.userId, preferences); }
}

/** Mutable deterministic clock for preferences tests. */
export class FixedPreferencesClock implements PreferencesClock {
  /**
   * Creates a fixed clock.
   *
   * @param value - Initial ISO timestamp returned by the clock.
   */
  constructor(private value = "2026-08-15T00:00:00.000Z") {}

  /**
   * Reads the configured timestamp.
   *
   * @returns The current fixed timestamp.
   */
  now(): string { return this.value; }

  /**
   * Changes the timestamp returned by the clock.
   *
   * @param value - New ISO timestamp.
   * @returns Nothing after updating the test double.
   */
  set(value: string): void { this.value = value; }
}

/**
 * Creates a valid preferences fixture with optional field overrides.
 *
 * @param overrides - Fields to replace in the default fixture.
 * @returns A preferences value suitable for application tests.
 */
export function userPreferencesFixture(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return { ...defaultUserPreferences(userId("user-fixture"), "2026-08-15T00:00:00.000Z"), ...overrides };
}
