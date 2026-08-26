/** Failure safe to transfer between Electron processes. */
export interface DesktopIpcFailure {
  readonly code: string;
  readonly message: string;
  readonly requestId: string | null;
}

/** Serializable result used by Desktop capability boundaries. */
export type DesktopResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DesktopIpcFailure };
