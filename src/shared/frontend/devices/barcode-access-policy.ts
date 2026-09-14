/** Reserved prefix for credentials that must never enter product scan flows. */
export const BADGE_BARCODE_PREFIX = "KONT-";
const BADGE_BARCODE_PATTERN = /^KONT-[A-Za-z0-9_-]{20,25}$/;

/**
 * Confirms that a raw value has the complete, case-sensitive credential shape.
 *
 * @param barcode - Raw scanner value.
 * @returns Whether the value can be submitted as an access credential.
 */
export function isValidBadgeBarcode(barcode: string): boolean {
    return BADGE_BARCODE_PATTERN.test(barcode);
}

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
