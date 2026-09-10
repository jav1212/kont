/** Reserved prefix for credentials that must never enter product scan flows. */
export const BADGE_BARCODE_PREFIX = "KONT-";

/**
 * Identifies a credential barcode before it can enter UI scanner state.
 *
 * @param barcode - Raw scanner value.
 * @returns Whether this value is reserved for access authentication.
 */
export function isBadgeBarcode(barcode: string): boolean {
    return barcode.startsWith(BADGE_BARCODE_PREFIX);
}

/**
 * Prevents legacy Bridge broadcasts from bypassing an active exclusive lease.
 *
 * @param accessCaptureActive - Whether an access screen currently owns scans.
 * @param barcode - Raw Bridge broadcast value.
 * @returns Whether the normal product scanner path may receive this value.
 */
export function mayDeliverRawBridgeScan(accessCaptureActive: boolean, barcode: string): boolean {
    return !accessCaptureActive && !isBadgeBarcode(barcode);
}
