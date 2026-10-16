export type PreferencesFailureCode =
  | "PREFERENCES_INVALID"
  | "PREFERENCES_VERSION_CONFLICT"
  | "PREFERENCES_REPOSITORY_UNAVAILABLE";

/** Expected preferences failure with a stable machine-readable classification. */
export class PreferencesFailure extends Error {
  /**
   * @param code - Stable failure classification.
   * @param message - Safe diagnostic message.
   * @param options - Optional original cause.
   */
  constructor(readonly code: PreferencesFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PreferencesFailure";
  }
}
