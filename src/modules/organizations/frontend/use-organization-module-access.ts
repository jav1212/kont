"use client";

import { useCallback, useMemo } from "react";
import { useOrganization } from "./context/organization-context";
import { getOrganizationRouteAccess, hasOrganizationPermission, resolveOrganizationRouteAccess, type OrganizationRouteAccess, type OrganizationRouteAccessState } from "./module-access-policy";

export type OrganizationAccessState = OrganizationRouteAccessState;

/**
 * Resolves a selected organization's authorization state for a pathname.
 * Missing organization data and directory failures intentionally fail closed.
 *
 * @param pathname - Current Web pathname.
 * @returns The route requirement, access state, selected organization name, and permission predicate.
 * @throws Error when called outside OrganizationProvider.
 */
export function useOrganizationModuleAccess(pathname: string): {
  readonly routeAccess: OrganizationRouteAccess;
  readonly state: OrganizationAccessState;
  readonly organizationName: string | null;
  readonly can: (permission: `${string}.${string}`) => boolean;
} {
  const { organization, loading, error } = useOrganization();
  const routeAccess = useMemo(() => getOrganizationRouteAccess(pathname), [pathname]);
  const can = useCallback((permission: `${string}.${string}`): boolean =>
    !!organization && !loading && !error && hasOrganizationPermission(organization.permissions, permission),
  [error, loading, organization]);
  const state = resolveOrganizationRouteAccess(routeAccess, { loading, error, permissions: organization?.permissions ?? null });
  return { routeAccess, state, organizationName: organization?.name ?? null, can };
}
