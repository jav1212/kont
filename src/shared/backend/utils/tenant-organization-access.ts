/**
 * A legacy tenant membership as stored by the production Web bridge.
 */
export interface LegacyTenantMembershipAccess {
    readonly tenantId: string;
    readonly role: string;
}

/** Legacy role labels retained by the production Web compatibility boundary. */
export type LegacyOrganizationRole = 'owner' | 'admin' | 'contador' | 'contable' | 'vendedor' | 'cajero';

/**
 * Maps an assigned canonical role to the limited legacy role vocabulary.
 * @param code - Canonical role code from a verified active organization snapshot.
 * @returns The corresponding legacy label; custom roles never inherit owner/admin authority.
 */
export function legacyRoleFromCanonical(code: string): LegacyOrganizationRole {
    switch (code) {
        case 'owner': return 'owner';
        case 'admin': return 'admin';
        case 'accountant': return 'contador';
        case 'seller': return 'vendedor';
        case 'cashier': return 'cajero';
        default: return 'cajero';
    }
}

/**
 * Input used to resolve a legacy tenant only when its organization bridge is active.
 */
export interface ActiveLegacyTenantResolutionInput {
    readonly userId: string;
    readonly requestedTenantId: string | null;
    readonly barcodeTenantId: string | null;
    readonly ownsRequestedTenant: boolean;
    readonly memberships: readonly LegacyTenantMembershipAccess[];
    readonly activeOrganizationTenantIds: ReadonlySet<string>;
}

/**
 * An active, authorized legacy tenant selection.
 */
export interface ActiveLegacyTenantResolution {
    readonly tenantId: string;
    readonly role: string;
    readonly isOwner: boolean;
}

/**
 * Resolves a legacy tenant without falling back from an explicit or barcode-pinned
 * suspended selection to another workspace.
 *
 * @param input Authenticated actor, selected tenant, memberships, and active bridge ids.
 * @returns The authorized active tenant, or null when the selection is unauthorized or suspended.
 * @throws Never throws; invalid or incomplete persistence state resolves to null.
 */
export function resolveActiveLegacyTenant(
    input: ActiveLegacyTenantResolutionInput,
): ActiveLegacyTenantResolution | null {
    const selectedTenantId = input.barcodeTenantId ?? input.requestedTenantId;
    const isActive = (tenantId: string): boolean => input.activeOrganizationTenantIds.has(tenantId);
    const membershipFor = (tenantId: string): LegacyTenantMembershipAccess | undefined =>
        input.memberships.find((membership) => membership.tenantId === tenantId);

    if (selectedTenantId) {
        if (!isActive(selectedTenantId)) return null;
        if (selectedTenantId === input.userId && input.ownsRequestedTenant) {
            return { tenantId: selectedTenantId, role: "owner", isOwner: true };
        }
        const membership = membershipFor(selectedTenantId);
        return membership
            ? { tenantId: membership.tenantId, role: membership.role, isOwner: false }
            : null;
    }

    if (input.ownsRequestedTenant && isActive(input.userId)) {
        return { tenantId: input.userId, role: "owner", isOwner: true };
    }

    const membership = input.memberships.find((entry) => isActive(entry.tenantId));
    return membership
        ? { tenantId: membership.tenantId, role: membership.role, isOwner: false }
        : null;
}
