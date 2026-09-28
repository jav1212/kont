/**
 * Applies the workspace boundary before a scanned badge is allowed to replace
 * an existing browser session.
 *
 * @param badgeTenantId Tenant resolved from the badge by the server.
 * @param activeTenantId Tenant resolved from the current authenticated request;
 * null represents an anonymous browser and undefined represents an invalid or
 * unauthorized existing session.
 * @returns Whether the badge may be exchanged without crossing organizations.
 */
export function mayExchangeBadgeInWorkspace(
    badgeTenantId: string,
    activeTenantId: string | null | undefined,
): boolean {
    return activeTenantId === null || (
        typeof activeTenantId === 'string'
        && activeTenantId.length > 0
        && activeTenantId === badgeTenantId
    );
}
