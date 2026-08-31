import { PreferencesFailure, createUserPreferences, defaultUserPreferences, type AppearancePreferences, type RegionalPreferences, type UserPreferences } from "../domain";
import type { UserId } from "@kontave/organizations/domain";

export interface UserPreferencesRepository {
  /**
   * Loads preferences for a user.
   *
   * @param userId - Preferences owner.
   * @returns The persisted snapshot, or `null` when defaults still apply.
   * @throws {PreferencesFailure} When persistence is unavailable.
   */
  findByUser(userId: UserId): Promise<UserPreferences | null>;
  /**
   * Saves preferences using optimistic concurrency.
   *
   * @param preferences - Validated snapshot to persist.
   * @param expectedVersion - Version that must currently be stored.
   * @returns The authoritative persisted snapshot.
   * @throws {PreferencesFailure} When persistence or the version check fails.
   */
  save(preferences: UserPreferences, expectedVersion: number): Promise<UserPreferences>;
}

/** Supplies deterministic audit instants. */
export interface PreferencesClock {
  /**
   * Returns the current instant.
   *
   * @returns An ISO timestamp suitable for preferences audit metadata.
   */
  now(): string;
}

/** Reads persisted preferences or computes portable defaults without writing. */
export class GetEffectiveUserPreferences {
  /**
   * Creates the preferences query.
   *
   * @param repository - Persistence port for user preferences.
   * @param clock - Source of the timestamp used by computed defaults.
   */
  constructor(private readonly repository: UserPreferencesRepository, private readonly clock: PreferencesClock) {}

  /**
   * Resolves the effective preferences for a user.
   *
   * @param userId - Preferences owner.
   * @returns Persisted preferences or an unpersisted version-zero default.
   * @throws {PreferencesFailure} When persistence is unavailable.
   */
  async execute(userId: UserId): Promise<UserPreferences> {
    try { return await this.repository.findByUser(userId) ?? defaultUserPreferences(userId, this.clock.now()); }
    catch (cause: unknown) { throw repositoryFailure(cause); }
  }
}

/** Applies partial preference changes with optimistic concurrency. */
export class UpdateUserPreferences {
  /**
   * Creates the preferences update use case.
   *
   * @param repository - Persistence port for user preferences.
   * @param clock - Source of the update audit timestamp.
   */
  constructor(private readonly repository: UserPreferencesRepository, private readonly clock: PreferencesClock) {}

  /**
   * Merges and saves an atomic preferences update.
   *
   * @param command - Owner, expected version and partial appearance or regional changes.
   * @returns The authoritative persisted preferences.
   * @throws {PreferencesFailure} When validation, persistence or optimistic concurrency fails.
   */
  async execute(command: {
    readonly userId: UserId;
    readonly expectedVersion: number;
    readonly appearance?: Partial<AppearancePreferences>;
    readonly regional?: Partial<RegionalPreferences>;
  }): Promise<UserPreferences> {
    let current: UserPreferences;
    try { current = await this.repository.findByUser(command.userId) ?? defaultUserPreferences(command.userId, this.clock.now()); }
    catch (cause: unknown) { throw repositoryFailure(cause); }
    if (current.version !== command.expectedVersion) {
      throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "Preferences changed in another client.");
    }
    const candidate = createUserPreferences({
      ...current,
      appearance: { ...current.appearance, ...command.appearance },
      regional: { ...current.regional, ...command.regional },
      version: current.version + 1,
      updatedAt: this.clock.now(),
    });
    try { return await this.repository.save(candidate, command.expectedVersion); }
    catch (cause: unknown) { throw repositoryFailure(cause); }
  }
}

function repositoryFailure(cause: unknown): PreferencesFailure {
  if (cause instanceof PreferencesFailure) return cause;
  return new PreferencesFailure("PREFERENCES_REPOSITORY_UNAVAILABLE", "User preferences are unavailable.", { cause });
}
