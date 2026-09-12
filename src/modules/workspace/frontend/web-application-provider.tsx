"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ModuleCode } from "@kontave/modules/domain";
import { GlobalInteractionGate } from "@kontave/client-interaction";
import { useAuth } from "../../auth/frontend/hooks/use-auth";
import { BarcodeSessionGuard } from "../../auth/frontend/components/barcode-session-guard";
import { ActiveTenantContext } from "../../memberships/frontend/context/active-tenant-context";
import { OrganizationContext } from "../../organizations/frontend/context/organization-context";
import { CompanyContext } from "../../companies/frontend/hooks/use-companies";
import { GlobalInteractionBoundary } from "@/src/shared/frontend/components/global-interaction-boundary";
import { createBrowserApplication } from "./web-browser-adapters";
import { useWebCompanyActions } from "./web-company-actions";
import type {
  WebApplicationController,
  WebApplicationSnapshot,
} from "./web-application-controller";

interface WebApplicationContextValue {
  readonly controller: WebApplicationController;
  readonly snapshot: WebApplicationSnapshot;
}

const WebApplicationContext = createContext<WebApplicationContextValue | null>(
  null,
);

/** Hosts one isolated runtime per authenticated Web actor.
 * @param props - Business pages protected by session and global interaction state.
 * @returns Session supervision outside the workspace's disposable business subtree.
 */
export function WebApplicationProvider({
  children,
}: {
  readonly children: ReactNode;
}): React.JSX.Element {
  const { user, status } = useAuth();
  const [startup] = useState(() => {
    const gate = new GlobalInteractionGate();
    gate.acquire({
      kind: "startup",
      state: "working",
      priority: 700,
      message: "Preparando Kontave",
      description: "Estamos restaurando tu sesión.",
    });
    return gate;
  });
  return (
    <BarcodeSessionGuard>
      {status === "authenticated" && user ? (
        <AuthenticatedApplication key={user.id} actorId={user.id}>
          {children}
        </AuthenticatedApplication>
      ) : (
        <GlobalInteractionBoundary
          gate={startup}
          onAction={() => undefined}
          unmountContent
        >
          {null}
        </GlobalInteractionBoundary>
      )}
    </BarcodeSessionGuard>
  );
}

/** Provides portable state to the existing Web hooks without starting parallel context owners.
 * @param props - Authenticated actor and protected content.
 * @returns Compatibility contexts backed by one committed workspace snapshot.
 */
function AuthenticatedApplication({
  actorId,
  children,
}: {
  readonly actorId: string;
  readonly children: ReactNode;
}): React.JSX.Element {
  const [controller] = useState(() => createBrowserApplication(actorId));
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const pathname = usePathname();
  const params = useSearchParams();
  const urlTenant = params.get("tid");
  const urlCompany = params.get("cid");
  const companyActions = useWebCompanyActions(
    controller,
    snapshot.tenantId,
    actorId,
  );

  useEffect(() => {
    void controller.start();
    return () => {
      void controller.stop();
    };
  }, [controller]);

  useEffect(() => {
    const check = () => {
      void controller.connectivity.refresh();
    };
    check();
    const interval = window.setInterval(check, 15_000);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
    };
  }, [controller]);

  useEffect(() => {
    const state = controller.getSnapshot();
    if (state.status === "stopped") return;
    // Ignore a render carrying search params from before our synchronous commit.
    const actual = new URL(window.location.href).searchParams;
    if (actual.get("tid") !== urlTenant || actual.get("cid") !== urlCompany)
      return;
    if (
      (urlTenant && urlTenant !== state.tenantId) ||
      (urlCompany && urlCompany !== state.workspace.activeCompany?.id)
    ) {
      void controller.navigate({
        tenantId: urlTenant ?? state.tenantId,
        companyId: urlCompany,
        moduleCode: state.workspace.activeModule?.code ?? null,
      });
    }
  }, [controller, urlCompany, urlTenant]);

  useEffect(() => {
    const current = controller.getSnapshot();
    const moduleCode = pathname.split("/")[1] as ModuleCode | undefined;
    if (
      current.status === "ready" &&
      moduleCode &&
      current.workspace.modules.some((entry) => entry.code === moduleCode)
    )
      void controller.selectModule(moduleCode);
  }, [controller, pathname, snapshot.status, snapshot.tenantId]);

  const organization =
    snapshot.organizations.find(
      (entry) =>
        entry.id === snapshot.workspace.activeWorkspace?.organizationId,
    ) ?? null;
  const loading =
    snapshot.status === "loading" || snapshot.status === "stopped";
  const available = snapshot.status === "ready";
  const activeTenant = snapshot.tenants.find(
    (entry) => entry.tenantId === snapshot.tenantId,
  );
  const permissions = useMemo(
    () => (available ? (organization?.permissions ?? []) : []),
    [available, organization?.permissions],
  );
  const operationRoute =
    pathname === "/inventory/operations/new" &&
    !!organization &&
    (organization.permissions.includes("*") ||
      (organization.permissions.includes("inventory.read") &&
        organization.permissions.includes("inventory.create")));
  useEffect(() => {
    // Initial adoption: only an authorized creation workflow consumes these defaults.
    controller.setOperationRequired(operationRoute);
  }, [controller, operationRoute]);
  const tenantValue = useMemo(
    () => ({
      allTenants: [...snapshot.tenants],
      activeTenantId: snapshot.tenantId,
      activeTenantRole: activeTenant?.role ?? null,
      activePermissions: [...permissions],
      can: (permission: string) =>
        permissions.includes("*") || permissions.includes(permission),
      isActingOnBehalf: !!snapshot.tenantId && snapshot.tenantId !== actorId,
      loading,
      switchTenant: (tenantId: string) => {
        void controller.selectTenant(tenantId);
      },
      clearActiveTenant: () => {
        const fallback =
          snapshot.tenants.find((entry) => entry.isOwn) ?? snapshot.tenants[0];
        if (fallback) void controller.selectTenant(fallback.tenantId);
      },
    }),
    [
      activeTenant?.role,
      actorId,
      controller,
      loading,
      permissions,
      snapshot.tenants,
      snapshot.tenantId,
    ],
  );
  const organizationValue = useMemo(
    () => ({
      organizations: snapshot.organizations,
      organization,
      loading,
      error: snapshot.error,
      refresh: () => {
        const current = controller.getSnapshot();
        return current.status === "ready" &&
          current.workspace.activeWorkspace?.organizationId === organization?.id
          ? controller.refresh()
          : Promise.resolve();
      },
      selectOrganization: (id: string) => {
        void controller.selectOrganization(id);
      },
    }),
    [controller, loading, organization, snapshot.error, snapshot.organizations],
  );
  const companyValue = useMemo(
    () => ({
      ...companyActions,
      companies: [...snapshot.companies],
      company:
        snapshot.companies.find(
          (entry) => entry.id === snapshot.workspace.activeCompany?.id,
        ) ?? null,
      companyId: snapshot.workspace.activeCompany?.id ?? null,
      loading,
      error: snapshot.error,
    }),
    [
      companyActions,
      loading,
      snapshot.companies,
      snapshot.error,
      snapshot.workspace.activeCompany?.id,
    ],
  );
  const context = useMemo(
    () => ({ controller, snapshot }),
    [controller, snapshot],
  );
  const operationNeeded = operationRoute && !!snapshot.workspace.activeCompany;
  const operationReady =
    !operationNeeded || snapshot.operationContext.status === "ready";

  return (
    <WebApplicationContext.Provider value={context}>
      <ActiveTenantContext.Provider value={tenantValue}>
        <OrganizationContext.Provider value={organizationValue}>
          <CompanyContext.Provider value={companyValue}>
            <GlobalInteractionBoundary
              gate={controller.interaction}
              onAction={(token, action) =>
                controller.handleInteractionAction(token, action)
              }
              unmountContent={!available || !operationReady}
            >
              {available && operationReady ? (
                <div
                  key={`${actorId}:${snapshot.tenantId}:${snapshot.workspace.activeCompany?.id ?? ""}`}
                  className="contents"
                >
                  {children}
                </div>
              ) : null}
            </GlobalInteractionBoundary>
          </CompanyContext.Provider>
        </OrganizationContext.Provider>
      </ActiveTenantContext.Provider>
    </WebApplicationContext.Provider>
  );
}

/** Reads the session-owned runtime and its committed aggregate.
 * @returns Observable global state and typed application commands.
 * @throws Error when called outside the authenticated Web application.
 */
export function useWebApplication(): WebApplicationContextValue {
  const context = useContext(WebApplicationContext);
  if (!context)
    throw new Error("useWebApplication requiere WebApplicationProvider.");
  return context;
}
