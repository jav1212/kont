"use client";

import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { useActiveTenantContext } from "@/src/modules/memberships/frontend/context/active-tenant-context";
import { workspaceSchema, type OrganizationWorkspace } from "../../contracts";
import { organizationRequest } from "../organization-request";

interface OrganizationContextValue {
  readonly organizations: readonly OrganizationWorkspace[];
  readonly organization: OrganizationWorkspace | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly selectOrganization: (id: string) => void;
}

interface DirectoryState {
  readonly userId: string | null;
  readonly tenantId: string | null;
  readonly organizations: readonly OrganizationWorkspace[];
  readonly loading: boolean;
  readonly error: string | null;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

/**
 * Presents the package-owned organization model within the existing Web session.
 * Selection preserves legacy operational API scope until their separate cutover.
 *
 * @param props - Content sharing the selected organization.
 * @returns The organization provider and a subtree remounted on tenant switches.
 * @throws Does not throw expected directory failures; exposes them as error state.
 */
export function OrganizationProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { user, isAuthenticated } = useAuth();
  const { activeTenantId, loading: tenantLoading, switchTenant } = useActiveTenantContext();
  const userId = user?.id ?? null;
  const [state, setState] = useState<DirectoryState>({ userId: null, tenantId: null, organizations: [], loading: true, error: null });
  const pending = useRef<AbortController | null>(null);

  const loadDirectory = useCallback((): Promise<void> => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    if (!isAuthenticated || !userId || tenantLoading || !activeTenantId) return Promise.resolve();
    return organizationRequest("/api/organizations", workspaceSchema.array(), {
      signal: controller.signal,
      headers: { "X-Tenant-Id": activeTenantId },
    }).then(
      (organizations) => {
        if (!controller.signal.aborted) setState({ userId, tenantId: activeTenantId, organizations, loading: false, error: null });
      },
      (cause: unknown) => {
        if (!controller.signal.aborted) setState({
          userId, tenantId: activeTenantId, organizations: [], loading: false,
          error: cause instanceof Error ? cause.message : "No se pudieron cargar las organizaciones.",
        });
      },
    );
  }, [activeTenantId, isAuthenticated, tenantLoading, userId]);

  const refresh = useCallback(async (): Promise<void> => {
    setState((previous) => ({ ...previous, loading: true, error: null }));
    await loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    // Scope changes derive their loading state below; only explicit retries set it.
    void loadDirectory();
    return () => pending.current?.abort();
  }, [loadDirectory]);

  const organizations = useMemo(() => isAuthenticated && state.userId === userId ? state.organizations : [], [isAuthenticated, state.organizations, state.userId, userId]);
  const selectOrganization = useCallback((id: string): void => {
    const next = organizations.find((entry) => entry.id === id);
    if (!next || next.legacyTenantId === activeTenantId) return;
    // A fiscal identifier can exist in multiple organizations; never carry its selection across them.
    localStorage.removeItem("kont-company-id");
    switchTenant(next.legacyTenantId);
  }, [activeTenantId, organizations, switchTenant]);

  const current = state.userId === userId && state.tenantId === activeTenantId;
  const value = useMemo<OrganizationContextValue>(() => ({
    organizations,
    organization: organizations.find((entry) => entry.legacyTenantId === activeTenantId) ?? null,
    loading: tenantLoading || (isAuthenticated && !!activeTenantId && (!current || state.loading)),
    error: current ? state.error : null,
    refresh,
    selectOrganization,
  }), [activeTenantId, current, isAuthenticated, organizations, refresh, selectOrganization, state.error, state.loading, tenantLoading]);

  return <OrganizationContext.Provider value={value}><Fragment key={`${userId}:${activeTenantId}`}>{children}</Fragment></OrganizationContext.Provider>;
}

/**
 * Reads the organization selected for the current Web workspace.
 *
 * @returns Directory, selected organization, loading state, and selection actions.
 * @throws Error when called outside OrganizationProvider.
 */
export function useOrganization(): OrganizationContextValue {
  const context = useContext(OrganizationContext);
  if (!context) throw new Error("useOrganization requiere OrganizationProvider.");
  return context;
}
