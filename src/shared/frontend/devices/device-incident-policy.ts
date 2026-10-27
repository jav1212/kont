// Decides which Kontave Device Manager errors are incidents.
//
// The Device Manager forwards every local `logger.error` as `manager.error`
// with the generic DEVICE_MANAGER_ERROR code. Most of those are the state of
// the user's workstation (no reader plugged in, reader base unavailable,
// outdated manager); the manager retries on its own and the same state already
// reaches the UI through `device.status` and `lastError`. Reporting them made
// up ~64% of system_error_logs. Only failures outside that catalog are incidents.

/** Connection attempts the manager retries every 30 s; their outcome is device state, not a failure. */
const CONNECTION_STATE = /^No se pudo conectar\b/i;

/** Codes that describe an environment the user must fix, already surfaced as `lastError`. */
const STATE_CODES = new Set(["PROTOCOL_MISMATCH"]);

interface ManagerErrorEvent {
    readonly code: string;
    readonly message: string;
}

/**
 * Tells whether a Device Manager error should become an incident.
 * @param event - `manager.error` event received from the local manager.
 * @returns `false` for workstation states the UI already shows; `true` for unexpected manager failures.
 */
export function isDeviceManagerIncident(event: ManagerErrorEvent): boolean {
    if (STATE_CODES.has(event.code)) return false;
    return !CONNECTION_STATE.test(event.message.trim());
}

/**
 * Builds the page-session deduplication key for a Device Manager error.
 * Each broadcast carries a fresh `eventId`, so the key uses the stable code and message instead;
 * otherwise the manager's periodic re-broadcasts of one failure would each become a new incident.
 * @param event - `manager.error` event received from the local manager.
 * @returns A stable signature for the failure.
 */
export function deviceManagerIncidentSignature(event: ManagerErrorEvent): string {
    return `${event.code}:${event.message.trim().slice(0, 300)}`;
}
