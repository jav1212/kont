const WORKSPACE_SELECTION_KEYS = [
  "kont-active-tenant-id",
  "kont-company-id",
  "kont-active-module",
  "sidebar-module",
  "kont-session-user-id",
] as const;

/** Identity returned by the server after a completed badge exchange. */
export interface BarcodeSessionActor {
  readonly id: string;
  readonly email: string;
}

let barcodeSessionTabId: string | null | undefined;

/**
 * Gets an identity unique to the current document for barcode-session notifications.
 *
 * @returns A random document identity, or null when the UUID API is unavailable.
 */
export function getBarcodeSessionTabId(): string | null {
  if (barcodeSessionTabId !== undefined) return barcodeSessionTabId;
  barcodeSessionTabId =
    typeof window === "undefined" || !globalThis.crypto?.randomUUID
      ? null
      : globalThis.crypto.randomUUID();
  return barcodeSessionTabId;
}

/**
 * Extracts the actor that the server authenticated for a scanned badge.
 *
 * @param payload - Untrusted JSON body returned by the badge authentication route.
 * @returns The server-confirmed actor, or null when the success envelope is incomplete.
 */
export function resolveBarcodeSessionActor(
  payload: unknown,
): BarcodeSessionActor | null {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("data" in payload) ||
    !payload.data ||
    typeof payload.data !== "object" ||
    !("user" in payload.data) ||
    !payload.data.user ||
    typeof payload.data.user !== "object"
  )
    return null;
  const { id, email } = payload.data.user as Record<string, unknown>;
  return typeof id === "string" && typeof email === "string"
    ? { id, email }
    : null;
}

/**
 * Removes browser state that was chosen by the operator being replaced.
 *
 * A badge exchange can replace the authenticated cookie without unloading the
 * current document first. None of the tenant, company, or module hints are
 * valid for the next operator, even where both users belong to the same
 * organization.
 *
 * @param storage - Browser storage for the current origin.
 * @returns Nothing after every workspace-selection hint has been removed.
 */
export function resetWorkspaceSelectionForBarcodeSession(
  storage: Pick<Storage, "removeItem">,
): void {
  WORKSPACE_SELECTION_KEYS.forEach((key) => storage.removeItem(key));
}
