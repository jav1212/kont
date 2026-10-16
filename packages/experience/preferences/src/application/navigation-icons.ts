import type { UserId } from "@kontave/organizations/domain";
import { createNavigationIcons, type NavigationIcons } from "@kontave/navigation";
import {
  PreferencesFailure,
  createUserProcessDefaults,
  defaultUserProcessDefaults,
  type UserProcessDefaults,
} from "../domain";
import type { PreferencesClock, UserProcessDefaultsRepository } from "./index";

const NAVIGATION_ICONS_PROCESS = "navigation.icons";

/** User-specific semantic icon overrides for stable application destinations. */
export interface UserNavigationIcons {
  readonly userId: UserId;
  readonly icons: NavigationIcons;
  readonly version: number;
  readonly updatedAt: string;
}

/** Reads portable navigation icon overrides, falling back to client defaults without writing. */
export class GetEffectiveUserNavigationIcons {
  /**
   * Creates the navigation icon query.
   * @param repository - User-scoped process-default persistence.
   * @param clock - Source of timestamps for unpersisted defaults.
   * @returns A query that resolves the user's effective icon overrides.
   */
  constructor(private readonly repository: UserProcessDefaultsRepository, private readonly clock: PreferencesClock) {}

  /**
   * Loads validated icon overrides without creating a preference row.
   * @param userId - Authenticated owner of the preferences.
   * @returns Effective sparse overrides and optimistic revision metadata.
   * @throws {PreferencesFailure} When stored values are invalid or persistence is unavailable.
   */
  async execute(userId: UserId): Promise<UserNavigationIcons> {
    try {
      const stored = await this.repository.find(userId, NAVIGATION_ICONS_PROCESS);
      return resolveIcons(stored ?? defaultUserProcessDefaults(userId, NAVIGATION_ICONS_PROCESS, this.clock.now()));
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }
}

/** Replaces all user navigation icon overrides using optimistic concurrency. */
export class UpdateUserNavigationIcons {
  /**
   * Creates the navigation icon command.
   * @param repository - User-scoped process-default persistence.
   * @param clock - Source of update audit timestamps.
   * @returns A command that validates and saves semantic icon overrides.
   */
  constructor(private readonly repository: UserProcessDefaultsRepository, private readonly clock: PreferencesClock) {}

  /**
   * Replaces the full set of destination icon overrides for one user.
   * @param command - Owner, expected revision and destination-to-icon selections.
   * @returns The authoritative overrides after persistence succeeds.
   * @throws {PreferencesFailure} When overrides are invalid, the revision is stale, or storage is unavailable.
   */
  async execute(command: {
    readonly userId: UserId;
    readonly expectedVersion: number;
    readonly icons: Readonly<Record<string, unknown>>;
  }): Promise<UserNavigationIcons> {
    const icons = parseIcons(command.icons);
    let current: UserProcessDefaults | null;
    try {
      current = await this.repository.find(command.userId, NAVIGATION_ICONS_PROCESS);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
    const effective = current ?? defaultUserProcessDefaults(command.userId, NAVIGATION_ICONS_PROCESS, this.clock.now());
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion !== effective.version) {
      throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "Navigation icons changed in another client.");
    }
    const candidate = createUserProcessDefaults({
      ...effective,
      values: icons,
      version: effective.version + 1,
      updatedAt: this.clock.now(),
    });
    try {
      return resolveIcons(await this.repository.save(candidate, effective.version));
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }
}

function resolveIcons(snapshot: UserProcessDefaults): UserNavigationIcons {
  return Object.freeze({
    userId: snapshot.userId,
    icons: parseIcons(snapshot.values),
    version: snapshot.version,
    updatedAt: snapshot.updatedAt,
  });
}

function parseIcons(values: Readonly<Record<string, unknown>>): NavigationIcons {
  try {
    return createNavigationIcons(values);
  } catch (cause: unknown) {
    throw new PreferencesFailure("PREFERENCES_INVALID", "User navigation icon overrides are invalid.", { cause });
  }
}

function repositoryFailure(cause: unknown): PreferencesFailure {
  return cause instanceof PreferencesFailure
    ? cause
    : new PreferencesFailure("PREFERENCES_REPOSITORY_UNAVAILABLE", "User navigation icons are unavailable.", { cause });
}
