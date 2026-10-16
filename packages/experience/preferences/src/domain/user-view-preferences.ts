import type { UserId } from "@kontave/organizations/domain";
import { PreferencesFailure } from "./preferences-failure";

/** Per-user choices for hiding optional fields and columns in one registered application view. */
export interface UserViewPreferences {
  readonly userId: UserId;
  readonly viewId: string;
  readonly hiddenFieldIds: readonly string[];
  readonly hiddenColumnIds: readonly string[];
  readonly version: number;
  readonly updatedAt: string;
}

/**
 * Creates a safe, immutable view-preference snapshot.
 * @param input - User, registered view key, hidden field/column identifiers and persistence metadata.
 * @returns Canonical snapshot with unique sorted identifiers.
 * @throws {PreferencesFailure} When the view, IDs, arrays, revision, or timestamp are invalid.
 */
export function createUserViewPreferences(input: UserViewPreferences): UserViewPreferences {
  if (!input.userId || !/^[a-z][a-z0-9._-]{0,127}$/.test(input.viewId)
    || !Number.isSafeInteger(input.version) || input.version < 0 || !Number.isFinite(Date.parse(input.updatedAt))) {
    throw invalid();
  }
  return Object.freeze({
    ...input,
    hiddenFieldIds: normalizeIds(input.hiddenFieldIds),
    hiddenColumnIds: normalizeIds(input.hiddenColumnIds),
  });
}

/**
 * Computes the unpersisted defaults for a registered view without creating database state.
 * @param userId - Owner of the preferences.
 * @param viewId - Stable lowercase view key owned by a client feature.
 * @param updatedAt - Timestamp used for the local default snapshot.
 * @returns Version-zero preferences with all fields and columns visible.
 * @throws {PreferencesFailure} When the owner, view key, or timestamp is invalid.
 */
export function defaultUserViewPreferences(userId: UserId, viewId: string, updatedAt: string): UserViewPreferences {
  return createUserViewPreferences({ userId, viewId, hiddenFieldIds: [], hiddenColumnIds: [], version: 0, updatedAt });
}

function normalizeIds(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values) || values.length > 100 || values.some((value) => typeof value !== "string" || !/^[a-z][a-z0-9._-]{0,127}$/.test(value))) {
    throw invalid();
  }
  const normalized = [...new Set(values)].sort();
  if (normalized.length !== values.length) throw invalid();
  return Object.freeze(normalized);
}

function invalid(): PreferencesFailure {
  return new PreferencesFailure("PREFERENCES_INVALID", "User view preferences are invalid.");
}
