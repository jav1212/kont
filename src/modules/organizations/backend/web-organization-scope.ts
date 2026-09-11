/** Persisted compatibility relationship, never inferred from an organization ID. */
export interface OrganizationTenantLink {
  readonly id: string;
  readonly legacy_tenant_id: string | null;
}

/**
 * Restricts Web workspaces to tenants the cookie session can actually operate.
 * @param links Organization mappings already scoped to active organization memberships.
 * @param allowedTenantIds Owned tenants and accepted, non-revoked legacy memberships.
 * @param barcodeTenantId Enrolled tenant for a terminal session, otherwise undefined.
 * @returns Authorized mappings only; null mappings and other terminal tenants are excluded.
 * @throws Never; this function performs no I/O.
 */
export function accessibleWebOrganizationLinks(
  links: readonly OrganizationTenantLink[],
  allowedTenantIds: ReadonlySet<string>,
  barcodeTenantId?: string,
): readonly OrganizationTenantLink[] {
  return links.filter((link) => link.legacy_tenant_id !== null
    && allowedTenantIds.has(link.legacy_tenant_id)
    && (barcodeTenantId === undefined || link.legacy_tenant_id === barcodeTenantId));
}

/**
 * Checks that an organization URL belongs to the selected Web tenant.
 * @param link Authorized organization mapping.
 * @param selectedTenantId Tenant validated from the session and request header.
 * @returns Whether the organization and selected tenant share the persisted mapping.
 * @throws Never; this function performs no I/O.
 */
export function matchesSelectedOrganizationTenant(
  link: OrganizationTenantLink | undefined,
  selectedTenantId: string,
): boolean {
  return link?.legacy_tenant_id === selectedTenantId;
}
