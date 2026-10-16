import type { UserId } from "@kontave/organizations/domain";
import { PreferencesFailure } from "./preferences-failure";

/** Primitive default values keyed by stable input identifiers owned by a client view. */
export type ProcessDefaultValue = string | number | boolean | null;

/** Per-user initial values for registered inputs in one business process. */
export interface UserProcessDefaults {
  readonly userId: UserId;
  readonly processId: string;
  readonly values: Readonly<Record<string, ProcessDefaultValue>>;
  readonly version: number;
  readonly updatedAt: string;
}

/**
 * Validates and freezes sparse user defaults without defining business validation.
 * @param input - Owner, process key, input values and concurrency metadata.
 * @returns Immutable defaults with canonical keys.
 * @throws {PreferencesFailure} When an identifier, value, timestamp or revision is invalid.
 */
export function createUserProcessDefaults(input: UserProcessDefaults): UserProcessDefaults {
  if (!input.userId || !/^[a-z][a-z0-9._-]{0,127}$/.test(input.processId)
    || !Number.isSafeInteger(input.version) || input.version < 0 || !Number.isFinite(Date.parse(input.updatedAt))) throw invalid();
  if (input.values === null || typeof input.values !== "object" || Array.isArray(input.values)) throw invalid();
  const entries = Object.entries(input.values);
  if (entries.length > 100 || JSON.stringify(input.values).length > 65_536 || entries.some(([key, value]) => !/^[a-z][a-z0-9._-]{0,127}$/.test(key)
    || (typeof value === "number" && !Number.isFinite(value))
    || !(value === null || ["string", "number", "boolean"].includes(typeof value)))) throw invalid();
  return Object.freeze({ ...input, values: Object.freeze(Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)))) });
}

/**
 * Builds an unpersisted empty default set for a registered process.
 * @param userId - Preference owner.
 * @param processId - Stable lowercase process key.
 * @param updatedAt - Clock value for this ephemeral default snapshot.
 * @returns Empty version-zero defaults.
 * @throws {PreferencesFailure} When the owner, key or timestamp is invalid.
 */
export function defaultUserProcessDefaults(userId: UserId, processId: string, updatedAt: string): UserProcessDefaults {
  return createUserProcessDefaults({ userId, processId, values: {}, version: 0, updatedAt });
}

function invalid(): PreferencesFailure { return new PreferencesFailure("PREFERENCES_INVALID", "User process defaults are invalid."); }
