import type { UserId } from "@kontave/organizations/domain";
import { PreferencesFailure, createUserProcessDefaults, defaultUserProcessDefaults, type UserProcessDefaults } from "../domain";
import type { PreferencesClock, UserProcessDefaultsRepository } from "./index";

/** User-owned field-label overrides scoped to a stable form or table view. */
export interface UserFieldLabels {
  readonly userId: UserId;
  readonly viewId: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly version: number;
  readonly updatedAt: string;
}

/** Resolves saved field names for one view without persisting defaults on read. */
export class GetEffectiveUserFieldLabels {
  /**
   * @param repository - User-scoped preference persistence.
   * @param clock - Source of timestamps for unpersisted defaults.
   */
  constructor(private readonly repository: UserProcessDefaultsRepository, private readonly clock: PreferencesClock) {}

  /**
   * Loads validated field-label overrides for a stable view identifier.
   * @param command - Authenticated user and owning view key.
   * @returns Sparse labels and the current optimistic revision.
   * @throws {PreferencesFailure} When the view, persisted labels, or storage are invalid.
   */
  async execute(command: { readonly userId: UserId; readonly viewId: string }): Promise<UserFieldLabels> {
    const processId = fieldLabelProcessId(command.viewId);
    try {
      const stored = await this.repository.find(command.userId, processId);
      return resolveFieldLabels(stored ?? defaultUserProcessDefaults(command.userId, processId, this.clock.now()), command.viewId);
    } catch (cause: unknown) { throw repositoryFailure(cause); }
  }
}

/** Replaces a user's custom field names for one view with compare-and-swap control. */
export class UpdateUserFieldLabels {
  /**
   * @param repository - User-scoped preference persistence.
   * @param clock - Source of update audit timestamps.
   */
  constructor(private readonly repository: UserProcessDefaultsRepository, private readonly clock: PreferencesClock) {}

  /**
   * Replaces all field-label overrides registered for the selected view.
   * @param command - User, view, expected revision, and sparse labels keyed by stable field ID.
   * @returns Authoritative persisted labels.
   * @throws {PreferencesFailure} When labels are invalid, the revision is stale, or storage is unavailable.
   */
  async execute(command: { readonly userId: UserId; readonly viewId: string; readonly expectedVersion: number; readonly labels: Readonly<Record<string, unknown>> }): Promise<UserFieldLabels> {
    const processId = fieldLabelProcessId(command.viewId);
    const labels = parseFieldLabels(command.labels);
    let current: UserProcessDefaults | null;
    try { current = await this.repository.find(command.userId, processId); }
    catch (cause: unknown) { throw repositoryFailure(cause); }
    const effective = current ?? defaultUserProcessDefaults(command.userId, processId, this.clock.now());
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion !== effective.version) {
      throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "Field labels changed in another client.");
    }
    const candidate = createUserProcessDefaults({
      ...effective,
      values: labels,
      version: effective.version + 1,
      updatedAt: this.clock.now(),
    });
    try { return resolveFieldLabels(await this.repository.save(candidate, effective.version), command.viewId); }
    catch (cause: unknown) { throw repositoryFailure(cause); }
  }
}

function fieldLabelProcessId(viewId: string): string {
  if (typeof viewId !== "string" || !/^[a-z][a-z0-9._-]{0,110}$/.test(viewId)) {
    throw new PreferencesFailure("PREFERENCES_INVALID", "Field-label view identifier is invalid.");
  }
  return `fields.labels.${viewId}`;
}

function resolveFieldLabels(snapshot: UserProcessDefaults, viewId: string): UserFieldLabels {
  return Object.freeze({ userId: snapshot.userId, viewId, labels: parseFieldLabels(snapshot.values), version: snapshot.version, updatedAt: snapshot.updatedAt });
}

function parseFieldLabels(values: Readonly<Record<string, unknown>>): Readonly<Record<string, string>> {
  if (!values || typeof values !== "object" || Array.isArray(values)) throw invalidLabels();
  const entries = Object.entries(values);
  if (entries.length > 100) throw invalidLabels();
  const labels: Record<string, string> = {};
  for (const [fieldId, rawLabel] of entries) {
    if (!/^[a-z][a-z0-9._-]{0,127}$/.test(fieldId) || typeof rawLabel !== "string") throw invalidLabels();
    if (/[\u0000-\u001f\u007f]/.test(rawLabel)) throw invalidLabels();
    const label = rawLabel.trim();
    if (!label || label.length > 60) throw invalidLabels();
    labels[fieldId] = label;
  }
  return Object.freeze(labels);
}

function invalidLabels(): PreferencesFailure {
  return new PreferencesFailure("PREFERENCES_INVALID", "User field labels are invalid.");
}

function repositoryFailure(cause: unknown): PreferencesFailure {
  return cause instanceof PreferencesFailure
    ? cause
    : new PreferencesFailure("PREFERENCES_REPOSITORY_UNAVAILABLE", "User field labels are unavailable.", { cause });
}
