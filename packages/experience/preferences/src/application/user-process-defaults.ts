import type { UserId } from "@kontave/organizations/domain";
import { PreferencesFailure, createUserProcessDefaults, defaultUserProcessDefaults, type ProcessDefaultValue, type UserProcessDefaults } from "../domain";
import type { PreferencesClock } from "./index";

/** Persistence boundary for defaults belonging to one user and one registered process. */
export interface UserProcessDefaultsRepository {
  /**
   * Loads the user's sparse defaults for a process.
   * @param userId - Authenticated preference owner.
   * @param processId - Stable process key.
   * @returns Stored defaults or null when no customization exists.
   * @throws {PreferencesFailure} When persistence is unavailable.
   */
  find(userId: UserId, processId: string): Promise<UserProcessDefaults | null>;
  /**
   * Saves a full snapshot through optimistic concurrency.
   * @param defaults - Validated defaults snapshot.
   * @param expectedVersion - Previously observed version, or zero for first save.
   * @returns Authoritative stored defaults.
   * @throws {PreferencesFailure} When persistence fails or the revision is stale.
   */
  save(defaults: UserProcessDefaults, expectedVersion: number): Promise<UserProcessDefaults>;
}

/** Resolves persisted process defaults without writing on first read. */
export class GetEffectiveUserProcessDefaults {
  /**
   * @param repository - User-scoped defaults persistence.
   * @param clock - Source for ephemeral default timestamps.
   */
  constructor(private readonly repository: UserProcessDefaultsRepository, private readonly clock: PreferencesClock) {}

  /**
   * Loads a process preference snapshot or returns empty defaults.
   * @param command - Preference owner and stable process identifier.
   * @returns Persisted or unpersisted defaults.
   * @throws {PreferencesFailure} When identity or persistence is invalid.
   */
  async execute(command: { readonly userId: UserId; readonly processId: string }): Promise<UserProcessDefaults> {
    try { return await this.repository.find(command.userId, command.processId) ?? defaultUserProcessDefaults(command.userId, command.processId, this.clock.now()); }
    catch (cause: unknown) { throw repositoryFailure(cause); }
  }
}

/** Replaces sparse field defaults atomically for one user and process. */
export class UpdateUserProcessDefaults {
  /**
   * @param repository - User-scoped defaults persistence.
   * @param clock - Source of the update audit timestamp.
   */
  constructor(private readonly repository: UserProcessDefaultsRepository, private readonly clock: PreferencesClock) {}

  /**
   * Replaces a complete defaults map after revision validation.
   * @param command - Owner, process, expected version and registered input defaults.
   * @returns Authoritative stored defaults.
   * @throws {PreferencesFailure} When the revision is stale, values invalid, or persistence unavailable.
   */
  async execute(command: { readonly userId: UserId; readonly processId: string; readonly expectedVersion: number; readonly values: Readonly<Record<string, ProcessDefaultValue>> }): Promise<UserProcessDefaults> {
    let current: UserProcessDefaults | null;
    try { current = await this.repository.find(command.userId, command.processId); }
    catch (cause: unknown) { throw repositoryFailure(cause); }
    const effective = current ?? defaultUserProcessDefaults(command.userId, command.processId, this.clock.now());
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion !== effective.version) {
      throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "Process defaults changed in another client.");
    }
    const candidate = createUserProcessDefaults({ ...effective, values: command.values, version: effective.version + 1, updatedAt: this.clock.now() });
    try { return await this.repository.save(candidate, effective.version); }
    catch (cause: unknown) { throw repositoryFailure(cause); }
  }
}

function repositoryFailure(cause: unknown): PreferencesFailure {
  return cause instanceof PreferencesFailure ? cause : new PreferencesFailure("PREFERENCES_REPOSITORY_UNAVAILABLE", "User process defaults are unavailable.", { cause });
}
