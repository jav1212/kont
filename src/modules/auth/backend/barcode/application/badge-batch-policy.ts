const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A validated command for issuing a bounded group of access credentials. */
export type BadgeBatchCommand = { userIds: readonly string[]; replaceExisting: boolean };

/**
 * Validates the transport-neutral limits for batch credential issuance.
 *
 * @param value - Untrusted request payload.
 * @param maximumUsers - Maximum number of unique users permitted by the endpoint.
 * @returns A sanitized immutable command, or null when the payload is invalid.
 */
export function parseBadgeBatchCommand(value: unknown, maximumUsers: number): BadgeBatchCommand | null {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Number.isInteger(maximumUsers) || maximumUsers < 1) return null;
    const candidate = value as { userIds?: unknown; replaceExisting?: unknown };
    if (!Array.isArray(candidate.userIds) || candidate.userIds.length < 1 || candidate.userIds.length > maximumUsers
        || candidate.userIds.some((userId) => typeof userId !== 'string' || !UUID_PATTERN.test(userId))
        || new Set(candidate.userIds).size !== candidate.userIds.length
        || (candidate.replaceExisting !== undefined && typeof candidate.replaceExisting !== 'boolean')) return null;
    return { userIds: [...candidate.userIds], replaceExisting: candidate.replaceExisting === true };
}

/** A validated command for exporting selected encrypted access credentials. */
export type BadgePrintCommand = { badgeIds: readonly string[] };

/**
 * Validates a bounded, de-duplicated set of badge IDs for a printable export.
 *
 * @param value - Untrusted request payload.
 * @param maximumBadges - Maximum number of selected cards permitted by the endpoint.
 * @returns A sanitized immutable print command, or null for invalid selection.
 */
export function parseBadgePrintCommand(value: unknown, maximumBadges: number): BadgePrintCommand | null {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Number.isInteger(maximumBadges) || maximumBadges < 1) return null;
    const candidate = value as { badgeIds?: unknown };
    if (!Array.isArray(candidate.badgeIds) || candidate.badgeIds.length < 1 || candidate.badgeIds.length > maximumBadges
        || candidate.badgeIds.some((badgeId) => typeof badgeId !== 'string' || !UUID_PATTERN.test(badgeId))
        || new Set(candidate.badgeIds).size !== candidate.badgeIds.length) return null;
    return { badgeIds: [...candidate.badgeIds] };
}
