import type { UserId } from "@kontave/organizations/domain";
import { createNavigationLabels, type NavigationLabels } from "@kontave/navigation";
import { PreferencesFailure, createUserProcessDefaults, defaultUserProcessDefaults, type UserProcessDefaults } from "../domain";
import type { PreferencesClock, UserProcessDefaultsRepository } from "./index";

const NAVIGATION_LABELS_PROCESS = "navigation.menu";

/** Persisted custom labels that override the stable application navigation catalog. */
export interface UserNavigationLabels {
  readonly userId: UserId;
  readonly labels: NavigationLabels;
  readonly version: number;
  readonly updatedAt: string;
}

/** Resolves user menu labels or leaves the canonical navigation names in effect. */
export class GetEffectiveUserNavigationLabels {
  /**
   * @param repository - User-scoped process-default persistence.
   * @param clock - Source of timestamps for unpersisted defaults.
   */
  constructor(private readonly repository: UserProcessDefaultsRepository, private readonly clock: PreferencesClock) {}

  /**
   * Loads validated overrides without creating a preference row.
   * @param userId - Authenticated labels owner.
   * @returns Effective sparse labels with concurrency metadata.
   * @throws {PreferencesFailure} When persisted labels or storage are invalid.
   */
  async execute(userId: UserId): Promise<UserNavigationLabels> {
    try {
      const stored = await this.repository.find(userId, NAVIGATION_LABELS_PROCESS);
      return resolveSnapshot(stored ?? defaultUserProcessDefaults(userId, NAVIGATION_LABELS_PROCESS, this.clock.now()));
    } catch (cause: unknown) { throw repositoryFailure(cause); }
  }
}

/** Saves a full set of user menu-name overrides under compare-and-swap control. */
export class UpdateUserNavigationLabels {
  /**
   * @param repository - User-scoped process-default persistence.
   * @param clock - Source of update audit timestamps.
   */
  constructor(private readonly repository: UserProcessDefaultsRepository, private readonly clock: PreferencesClock) {}

  /**
   * Replaces all custom navigation labels for one user.
   * @param command - Authenticated owner, expected revision, and destination labels.
   * @returns Authoritative labels after persistence succeeds.
   * @throws {PreferencesFailure} When labels are invalid, the revision is stale, or storage is unavailable.
   */
  async execute(command: { readonly userId: UserId; readonly expectedVersion: number; readonly labels: Readonly<Record<string, unknown>> }): Promise<UserNavigationLabels> {
    const labels = parseLabels(command.labels);
    let current: UserProcessDefaults | null;
    try { current = await this.repository.find(command.userId, NAVIGATION_LABELS_PROCESS); }
    catch (cause: unknown) { throw repositoryFailure(cause); }
    const effective = current ?? defaultUserProcessDefaults(command.userId, NAVIGATION_LABELS_PROCESS, this.clock.now());
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion !== effective.version) {
      throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "Navigation labels changed in another client.");
    }
    const candidate = createUserProcessDefaults({
      ...effective,
      values: labels,
      version: effective.version + 1,
      updatedAt: this.clock.now(),
    });
    try { return resolveSnapshot(await this.repository.save(candidate, effective.version)); }
    catch (cause: unknown) { throw repositoryFailure(cause); }
  }
}

function resolveSnapshot(snapshot: UserProcessDefaults): UserNavigationLabels {
  return Object.freeze({ userId: snapshot.userId, labels: parseLabels(snapshot.values), version: snapshot.version, updatedAt: snapshot.updatedAt });
}

function parseLabels(values: Readonly<Record<string, unknown>>): NavigationLabels {
  try { return createNavigationLabels(values); }
  catch (cause: unknown) { throw new PreferencesFailure("PREFERENCES_INVALID", "User navigation labels are invalid.", { cause }); }
}

function repositoryFailure(cause: unknown): PreferencesFailure {
  return cause instanceof PreferencesFailure
    ? cause
    : new PreferencesFailure("PREFERENCES_REPOSITORY_UNAVAILABLE", "User navigation labels are unavailable.", { cause });
}
