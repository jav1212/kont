import type { UserId } from "@kontave/organizations/domain";

export const ColorScheme = { Light: "light", Dark: "dark", System: "system" } as const;
export type ColorScheme = typeof ColorScheme[keyof typeof ColorScheme];
export const InterfaceDensity = { Comfortable: "comfortable", Compact: "compact" } as const;
export type InterfaceDensity = typeof InterfaceDensity[keyof typeof InterfaceDensity];

export interface AppearancePreferences {
  readonly colorScheme: ColorScheme;
  readonly density: InterfaceDensity;
}

export interface RegionalPreferences {
  readonly locale: string;
  readonly timeZone: string;
}

export interface UserPreferences {
  readonly userId: UserId;
  readonly appearance: AppearancePreferences;
  readonly regional: RegionalPreferences;
  readonly version: number;
  readonly updatedAt: string;
}

export type PreferencesFailureCode =
  | "PREFERENCES_INVALID"
  | "PREFERENCES_VERSION_CONFLICT"
  | "PREFERENCES_REPOSITORY_UNAVAILABLE";

export class PreferencesFailure extends Error {
  /**
   * Creates an expected preferences failure.
   *
   * @param code - Stable failure classification.
   * @param message - Safe diagnostic message.
   * @param options - Optional original cause.
   */
  constructor(readonly code: PreferencesFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PreferencesFailure";
  }
}

/**
 * Creates the portable default preferences for a user.
 *
 * @param userId - Owner of the preferences.
 * @param updatedAt - ISO timestamp used as initial audit metadata.
 * @returns A validated immutable version-zero snapshot.
 * @throws {PreferencesFailure} When the owner or timestamp produces an invalid snapshot.
 */
export function defaultUserPreferences(userId: UserId, updatedAt: string): UserPreferences {
  return createUserPreferences({
    userId,
    appearance: { colorScheme: ColorScheme.System, density: InterfaceDensity.Comfortable },
    regional: { locale: "es-VE", timeZone: "America/Caracas" },
    version: 0,
    updatedAt,
  });
}

/**
 * Validates, normalizes and freezes a user-preferences snapshot.
 *
 * @param input - Candidate appearance, regional and concurrency values.
 * @returns An immutable normalized preferences snapshot.
 * @throws {PreferencesFailure} When values, version or timestamp are invalid.
 */
export function createUserPreferences(input: UserPreferences): UserPreferences {
  if (!isColorScheme(input.appearance.colorScheme) || !isDensity(input.appearance.density)) throw invalid();
  if (!input.regional.locale.trim() || !input.regional.timeZone.trim()) throw invalid();
  if (!Number.isSafeInteger(input.version) || input.version < 0 || Number.isNaN(Date.parse(input.updatedAt))) throw invalid();
  return Object.freeze({
    ...input,
    appearance: Object.freeze({ ...input.appearance }),
    regional: Object.freeze({ locale: input.regional.locale.trim(), timeZone: input.regional.timeZone.trim() }),
  });
}

function isColorScheme(value: string): value is ColorScheme { return Object.values(ColorScheme).some((item) => item === value); }
function isDensity(value: string): value is InterfaceDensity { return Object.values(InterfaceDensity).some((item) => item === value); }
function invalid(): PreferencesFailure { return new PreferencesFailure("PREFERENCES_INVALID", "User preferences are invalid."); }
