/** Server state required to decide whether a barcode session may render. */
export interface BarcodeSessionState {
    readonly registered: boolean;
    readonly active: boolean;
    readonly sessionId?: string;
}

/**
 * Determines whether the access screen must replace the current application.
 *
 * @param session - Sanitized state returned by the barcode-session route.
 * @returns True only for a known barcode session that is no longer active.
 */
export function mustLeaveForBarcodeSession(session: BarcodeSessionState): boolean {
    return session.registered && (!session.active || !session.sessionId);
}

/**
 * Limits server activity updates to trusted, spaced interactions.
 *
 * @param trusted - Whether the browser marked the interaction as user generated.
 * @param now - Current timestamp in milliseconds.
 * @param previous - Timestamp of the prior heartbeat.
 * @param minimumInterval - Required delay between activity updates.
 * @returns True when this interaction may extend the server-side idle deadline.
 */
export function shouldReportBarcodeActivity(trusted: boolean, now: number, previous: number, minimumInterval: number): boolean {
    return trusted && now - previous >= minimumInterval;
}

/** Result of reconciling an active browser view with the server session. */
export type BarcodeSessionReconciliation = "active" | "expired" | "changed";

/**
 * Keeps an old tab from treating a newer server session as its own.
 *
 * @param currentSessionId - Registry session that originally rendered the tab.
 * @param server - Latest server session state.
 * @returns Whether to retain the view, lock it, or reload for a replacement session.
 */
export function reconcileBarcodeSession(currentSessionId: string, server: BarcodeSessionState): BarcodeSessionReconciliation {
    if (!server.registered || !server.active || !server.sessionId) return "expired";
    return server.sessionId === currentSessionId ? "active" : "changed";
}
