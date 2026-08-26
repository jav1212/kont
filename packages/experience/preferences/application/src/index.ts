import { PreferencesFailure, createUserPreferences, defaultUserPreferences, type AppearancePreferences, type RegionalPreferences, type UserPreferences } from "@kontave/preferences-domain";
import type { UserId } from "@kontave/organizations-domain";

export interface UserPreferencesRepository {
  findByUser(userId: UserId): Promise<UserPreferences | null>;
  save(preferences: UserPreferences, expectedVersion: number): Promise<UserPreferences>;
}

export interface PreferencesClock { now(): string; }

export class GetEffectiveUserPreferences {
  constructor(private readonly repository: UserPreferencesRepository, private readonly clock: PreferencesClock) {}
  async execute(userId: UserId): Promise<UserPreferences> {
    try { return await this.repository.findByUser(userId) ?? defaultUserPreferences(userId, this.clock.now()); }
    catch (cause: unknown) { throw repositoryFailure(cause); }
  }
}

export class UpdateUserPreferences {
  constructor(private readonly repository: UserPreferencesRepository, private readonly clock: PreferencesClock) {}
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
