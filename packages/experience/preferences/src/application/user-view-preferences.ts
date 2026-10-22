import type { UserId } from "@kontave/organizations/domain";
import { PreferencesFailure, createUserViewPreferences, defaultUserViewPreferences, type UserViewPreferences } from "../domain";
import type { PreferencesClock } from "./index";

/** Persistence port for one user's optional-field and table-column choices. */
export interface UserViewPreferencesRepository {
  /**
   * Loads one user's saved layout choices.
   * @param userId - Authenticated owner identifier.
   * @param viewId - Stable screen/view key.
   * @returns Stored preferences, or `null` when defaults still apply.
   * @throws {PreferencesFailure} When persistence or ownership validation fails.
   */
  find(userId: UserId, viewId: string): Promise<UserViewPreferences | null>;
  /**
   * Saves layout choices using compare-and-swap revision semantics.
   * @param preferences - Validated full view-preference snapshot.
   * @param expectedVersion - Version observed before editing; zero denotes creation.
   * @returns The authoritative stored snapshot.
   * @throws {PreferencesFailure} When persistence or optimistic concurrency fails.
   */
  save(preferences: UserViewPreferences, expectedVersion: number): Promise<UserViewPreferences>;
}

/** Resolves persisted or unpersisted defaults for an application's registered view. */
export class GetEffectiveUserViewPreferences {
  /**
   * @param repository - Per-user view-preference persistence.
   * @param clock - Source of the timestamp for computed defaults.
   */
  constructor(private readonly repository: UserViewPreferencesRepository, private readonly clock: PreferencesClock) {}

  /**
   * Resolves the hidden optional fields and columns for one view.
   * @param command - Preference owner and stable view identifier.
   * @returns Persisted choices or all-visible defaults without writing.
   * @throws {PreferencesFailure} When identity or persistence is invalid.
   */
  async execute(command: { readonly userId: UserId; readonly viewId: string }): Promise<UserViewPreferences> {
    try {
      return await this.repository.find(command.userId, command.viewId)
        ?? defaultUserViewPreferences(command.userId, command.viewId, this.clock.now());
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }
}

/** Updates a user's optional field/column visibility in one atomic revision. */
export class UpdateUserViewPreferences {
  /**
   * @param repository - Per-user view-preference persistence.
   * @param clock - Source of the update audit timestamp.
   */
  constructor(private readonly repository: UserViewPreferencesRepository, private readonly clock: PreferencesClock) {}

  /**
   * Replaces visibility lists after checking the caller's expected revision.
   * @param command - Owner, view, expected version, and one or both hidden-ID lists.
   * @returns Authoritative persisted choices.
   * @throws {PreferencesFailure} When the patch is empty, stale, invalid, or unavailable.
   */
  async execute(command: {
    readonly userId: UserId;
    readonly viewId: string;
    readonly expectedVersion: number;
    readonly hiddenFieldIds?: readonly string[];
    readonly hiddenColumnIds?: readonly string[];
  }): Promise<UserViewPreferences> {
    if (command.hiddenFieldIds === undefined && command.hiddenColumnIds === undefined) {
      throw new PreferencesFailure("PREFERENCES_INVALID", "At least one view-preference list must be provided.");
    }
    let current: UserViewPreferences | null;
    try {
      current = await this.repository.find(command.userId, command.viewId);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
    const effective = current ?? defaultUserViewPreferences(command.userId, command.viewId, this.clock.now());
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion !== effective.version) {
      throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "View preferences changed in another client.");
    }
    const candidate = createUserViewPreferences({
      ...effective,
      hiddenFieldIds: command.hiddenFieldIds ?? effective.hiddenFieldIds,
      hiddenColumnIds: command.hiddenColumnIds ?? effective.hiddenColumnIds,
      version: effective.version + 1,
      updatedAt: this.clock.now(),
    });
    try {
      return await this.repository.save(candidate, effective.version);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }
}

function repositoryFailure(cause: unknown): PreferencesFailure {
  return cause instanceof PreferencesFailure
    ? cause
    : new PreferencesFailure("PREFERENCES_REPOSITORY_UNAVAILABLE", "User view preferences are unavailable.", { cause });
}
