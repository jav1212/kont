import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Activity, BookOpen, Boxes, Building2, Calculator, CreditCard, Files, LifeBuoy, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, ShoppingBasket, ShoppingCart, UserRound, Usb, Wrench, X } from "lucide-react";
import type { KontaveTheme } from "@kontave/design-tokens";
import { codedErrorFeedback, errorFeedback } from "@kontave/client-feedback-application";
import {
  Alert,
  Button,
  Card,
  StatusBadge,
  Text,
  WorkspaceSidebar,
  presentFeedback,
  PortalStatusIndicator,
  type WorkspaceSidebarAccountAction,
  type WorkspaceSidebarItem,
  type WorkspaceSidebarModule,
} from "@kontave/ui-dom";
import type {
  DesktopAuthState,
  DesktopBillingPlanState,
  DesktopCurrentUserState,
  DesktopDeviceStatus,
  DesktopExternalDestination,
  DesktopPlatformStatusState,
  DesktopWorkspaceState,
  DesktopWorkspaceEntry,
} from "../../shared/desktop-api.js";
import type { ClientUpdateSnapshot } from "@kontave/client-updates-contracts";
import { AuthExperience } from "./auth/auth-experience.js";
import {
  clientInteractionAvailable,
  restoreDesktopSession,
  synchronizeAuthenticationInteraction,
  synchronizeWorkspaceBlock,
} from "./client-interaction.js";
import { desktopConnectivityStore } from "./connectivity-store.js";
import { applyDesktopTheme } from "./desktop-theme.js";
import { defaultModuleNavigationItem, moduleNavigationLabel, moduleNavigationSections } from "./module-navigation.js";

const DESKTOP_COMPACT_QUERY = "(max-width: 70rem)";
const DESKTOP_SIDEBAR_PINNED_KEY = "kontave.desktop.sidebar-pinned";
const DESKTOP_UTILITIES: readonly WorkspaceSidebarItem[] = [
  { id: "settings", label: "Configuración", icon: <Settings /> },
  { id: "help", label: "Ayuda", icon: <LifeBuoy /> },
];
const DESKTOP_ACCOUNT_ACTIONS: readonly WorkspaceSidebarAccountAction[] = [
  { id: "settings", label: "Configuración", icon: <Settings />, placement: "header" },
  { id: "profile", label: "Mi perfil", icon: <UserRound /> },
  { id: "help", label: "Ayuda", icon: <LifeBuoy /> },
  { id: "sign-out", label: "Cerrar sesión", icon: <LogOut />, tone: "danger" },
  { id: "billing", label: "Facturación y plan", icon: <CreditCard />, placement: "billing" },
];

export function App() {
  const [auth, setAuth] = useState<DesktopAuthState>({ status: "loading" });
  const [workspace, setWorkspace] = useState<DesktopWorkspaceState>({ status: "loading" });
  const [currentUser, setCurrentUser] = useState<DesktopCurrentUserState>({ status: "loading" });
  const [billingPlan, setBillingPlan] = useState<DesktopBillingPlanState>({ status: "loading" });
  const [platformStatus, setPlatformStatus] = useState<DesktopPlatformStatusState>({ status: "loading" });
  const [theme, setTheme] = useState<KontaveTheme>(() => localStorage.getItem("kontave.desktop.theme") === "dark" ? "dark" : "light");

  useEffect(() => {
    const updateAuth = (state: DesktopAuthState): void => {
      setAuth(state);
      synchronizeAuthenticationInteraction(state);
    };
    void restoreDesktopSession().then(updateAuth).catch(() => undefined);
    return window.kontave.auth.subscribe(updateAuth);
  }, []);

  useEffect(() => {
    void window.kontave.billing.getPlan().then(setBillingPlan).catch(() => undefined);
    return window.kontave.billing.subscribe(setBillingPlan);
  }, []);

  useEffect(() => {
    void window.kontave.platformStatus.getCurrent().then(setPlatformStatus).catch(() => undefined);
    return window.kontave.platformStatus.subscribe(setPlatformStatus);
  }, []);

  useEffect(() => {
    const updateWorkspace = (state: DesktopWorkspaceState): void => {
      setWorkspace(state);
      synchronizeWorkspaceBlock(state);
    };
    synchronizeWorkspaceBlock(workspace);
    void window.kontave.workspace.getState().then(updateWorkspace).catch(() => {
      updateWorkspace({ status: "unavailable" });
    });
    return window.kontave.workspace.subscribe(updateWorkspace);
    // The initial synchronization is intentionally performed once; subsequent
    // workspace changes arrive through the native subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void window.kontave.profile.getCurrent().then(setCurrentUser).catch(() => undefined);
    return window.kontave.profile.subscribe(setCurrentUser);
  }, []);

  useEffect(() => {
    localStorage.setItem("kontave.desktop.theme", theme);
    applyDesktopTheme(document.documentElement, theme);
  }, [theme]);

  if (auth.status === "authenticated") {
    return <DesktopAppShell auth={auth} billingPlan={billingPlan} currentUser={currentUser} platformStatus={platformStatus} workspace={workspace} theme={theme} onThemeChange={setTheme} onSignedOut={setAuth}>
      <DeviceCard />
    </DesktopAppShell>;
  }

  return <AuthExperience state={auth} onAuthenticated={setAuth} />;
}

function DesktopAppShell({ auth, billingPlan, children, currentUser, onSignedOut, onThemeChange, platformStatus, theme, workspace }: {
  readonly auth: Extract<DesktopAuthState, { status: "authenticated" }>;
  readonly billingPlan: DesktopBillingPlanState;
  readonly children: ReactNode;
  readonly currentUser: DesktopCurrentUserState;
  readonly onSignedOut: (state: DesktopAuthState) => void;
  readonly onThemeChange: (theme: KontaveTheme) => void;
  readonly platformStatus: DesktopPlatformStatusState;
  readonly theme: KontaveTheme;
  readonly workspace: DesktopWorkspaceState;
}) {
  const compactViewport = useCompactDesktopViewport();
  const [sidebarPinned, setSidebarPinned] = useState(readSidebarPinned);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeModuleId = workspace.status === "ready" ? workspace.activeModuleId : null;
  const [activeNavigationId, setActiveNavigationId] = useState<string | null>(() => defaultModuleNavigationItem(activeModuleId));
  const connectivity = useSyncExternalStore(
    desktopConnectivityStore.subscribe,
    desktopConnectivityStore.getSnapshot,
    desktopConnectivityStore.getSnapshot,
  );

  useEffect(() => setActiveNavigationId(defaultModuleNavigationItem(activeModuleId)), [activeModuleId]);
  useEffect(() => localStorage.setItem(DESKTOP_SIDEBAR_PINNED_KEY, String(sidebarPinned)), [sidebarPinned]);
  useEffect(() => setDrawerOpen(false), [compactViewport]);

  const sidebarPresentation = compactViewport ? "drawer" : sidebarPinned ? "persistent" : "collapsed";
  const closeDrawer = (): void => { if (compactViewport) setDrawerOpen(false); };

  function signOut(): void {
    if (!clientInteractionAvailable()) return;
    void window.kontave.auth.signOut().then((result) => {
      if (result.ok) onSignedOut(result.value);
    });
  }

  function openExternal(destination: DesktopExternalDestination): void {
    if (!clientInteractionAvailable()) return;
    void window.kontave.navigation.openExternal(destination).then((result) => {
      if (result.ok) return;
      presentFeedback.execute(errorFeedback(result.error.message, { deduplicationKey: `external-navigation-${destination}` }));
    });
  }

  const personalIdentity = currentUser.status === "ready" ? currentUser.user : null;
  const portalAvailability = platformStatus.status === "ready" ? platformStatus.availability : "unknown";
  const availableModules: readonly WorkspaceSidebarModule[] = workspace.status === "ready"
    ? workspace.modules.map((module) => ({
      id: module.id,
      label: module.name,
      subtitle: "Módulo organizacional",
      icon: moduleIcon(module.id),
    }))
    : [];
  const availableCompanies = workspace.status === "ready"
    ? workspace.companies.map((company) => ({
      id: company.id,
      name: company.name,
      subtitle: company.rif ?? "Empresa de la organización",
      ...(company.logoUrl ? { logoUrl: company.logoUrl } : {}),
    }))
    : [];
  const navigationSections = moduleNavigationSections(activeModuleId, activeNavigationId);
  const accountActions: readonly WorkspaceSidebarAccountAction[] = [
    ...DESKTOP_ACCOUNT_ACTIONS,
    {
      id: "status",
      label: "Estado de portales",
      icon: <Activity />,
      placement: "status",
      indicator: <PortalStatusIndicator status={portalAvailability} />,
    },
  ];

  return <div className="desktop-shell">
    {compactViewport && drawerOpen ? <button
      type="button"
      className="desktop-sidebar-backdrop"
      aria-label="Cerrar navegación"
      onClick={() => setDrawerOpen(false)}
    /> : null}
    <WorkspaceSidebar
      presentation={sidebarPresentation}
      open={compactViewport ? drawerOpen : true}
      onOpenChange={setDrawerOpen}
      closeIcon={<X />}
      modules={availableModules}
      activeModuleId={activeModuleId}
      companies={availableCompanies}
      activeCompanyId={workspace.status === "ready" ? workspace.activeCompanyId : null}
      activeWorkspaceId={workspace.status === "ready" ? workspace.activeWorkspaceId : null}
      workspaces={workspace.status === "ready" && workspace.workspaces.length > 1
        ? workspace.workspaces.map(toSidebarWorkspace)
        : []}
      sections={navigationSections}
      utilities={DESKTOP_UTILITIES}
      account={{
        name: personalIdentity?.displayName ?? accountDisplayName(auth),
        email: personalIdentity?.email ?? auth.user.email ?? auth.user.id,
        ...(personalIdentity?.avatarUrl ? { avatarUrl: personalIdentity.avatarUrl } : {}),
        ...(billingPlan.status === "ready" && billingPlan.planName ? { planName: billingPlan.planName } : {}),
        theme,
      }}
      accountActions={accountActions}
      onNavigate={(itemId) => {
        closeDrawer();
        if (itemId === "settings" || itemId === "help") openExternal(itemId);
        else setActiveNavigationId(itemId);
      }}
      onSelectModule={(moduleId) => {
        if (!clientInteractionAvailable()) return;
        closeDrawer();
        void window.kontave.workspace.selectModule(moduleId).then((result) => {
          if (result.ok) return;
          presentFeedback.execute(codedErrorFeedback({
            code: result.error.code,
            message: result.error.message,
            deduplicationKey: "module-selection-failed",
          }));
        });
      }}
      onSelectCompany={(companyId) => {
        if (!clientInteractionAvailable()) return;
        closeDrawer();
        void window.kontave.workspace.selectCompany(companyId).then((result) => {
          if (result.ok) return;
          presentFeedback.execute(codedErrorFeedback({
            code: result.error.code,
            message: result.error.message,
            deduplicationKey: "company-selection-failed",
          }));
        });
      }}
      onSelectWorkspace={(workspaceId) => {
        if (!clientInteractionAvailable()) return;
        closeDrawer();
        void window.kontave.workspace.select(workspaceId).then((result) => {
          if (result.ok) return;
          presentFeedback.execute(codedErrorFeedback({
            code: result.error.code,
            message: result.error.message,
            deduplicationKey: "workspace-selection-failed",
          }));
        });
      }}
      onThemeChange={onThemeChange}
      onAccountAction={(actionId) => {
        if (actionId === "sign-out") signOut();
        else if (isExternalDestination(actionId)) openExternal(actionId);
      }}
    />

    <div className="desktop-workspace">
      <header className="desktop-toolbar">
        <Button
          appearance="unstyled"
          className="desktop-sidebar-toggle"
          aria-label={compactViewport ? "Abrir navegación" : sidebarPinned ? "Contraer barra lateral" : "Fijar barra lateral"}
          aria-expanded={compactViewport ? drawerOpen : sidebarPinned}
          onClick={() => compactViewport ? setDrawerOpen(true) : setSidebarPinned((current) => !current)}
        >{compactViewport ? <Menu /> : sidebarPinned ? <PanelLeftClose /> : <PanelLeftOpen />}</Button>
        <div className="desktop-toolbar__title">
          <h1>{moduleNavigationLabel(activeModuleId, activeNavigationId)}</h1>
        </div>
      </header>
      <main className="desktop-content">
        {connectivity.availability === "degraded" ? <Alert intent="warning" className="desktop-connectivity-notice">
          La conexión es inestable. Algunas operaciones pueden tardar más.{' '}
          <Button size="sm" onClick={() => void desktopConnectivityStore.refresh()}>Reintentar</Button>
        </Alert> : null}
        <UpdateNotice />
        {children}
      </main>
    </div>
  </div>;
}

function UpdateNotice() {
  const [state, setState] = useState<ClientUpdateSnapshot>();

  useEffect(() => {
    void window.kontave.updates.getState().then(setState);
    return window.kontave.updates.subscribe(setState);
  }, []);

  if (!state || state.status === "idle" || state.status === "up-to-date" || state.status === "checking") return null;
  if (state.status === "available") {
    return <Alert intent="warning">
      Kontave Desktop {state.release.productVersion} está disponible.{' '}
      <Button size="sm" onClick={() => void window.kontave.updates.download().then(setState)}>Descargar</Button>
    </Alert>;
  }
  if (state.status === "downloading") {
    const progress = state.progress === null ? "" : ` (${Math.round(state.progress * 100)}%)`;
    return <Alert intent="warning">Descargando la actualización{progress}. Puedes continuar trabajando.</Alert>;
  }
  if (state.status === "ready") {
    return <Alert intent="warning">
      La actualización está lista. Guarda tu trabajo antes de reiniciar.{' '}
      <Button size="sm" onClick={() => void window.kontave.updates.apply()}>Reiniciar e instalar</Button>
    </Alert>;
  }
  if (state.status === "failed") {
    return <Alert intent="danger">
      No se pudo completar la actualización ({state.failure.code}).{' '}
      {state.failure.retryable ? <Button size="sm" onClick={() => void retryUpdate(state).then(setState)}>Reintentar</Button> : null}
    </Alert>;
  }
  return <Alert intent="warning">Aplicando la actualización…</Alert>;
}

function retryUpdate(state: Extract<ClientUpdateSnapshot, { status: "failed" }>): Promise<ClientUpdateSnapshot> {
  if (state.failure.operation === "download") return window.kontave.updates.download();
  if (state.failure.operation === "apply") return window.kontave.updates.apply();
  return window.kontave.updates.check();
}

function useCompactDesktopViewport(): boolean {
  const [compact, setCompact] = useState(() => window.matchMedia(DESKTOP_COMPACT_QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_COMPACT_QUERY);
    const update = (event: MediaQueryListEvent): void => setCompact(event.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return compact;
}

function readSidebarPinned(): boolean {
  return localStorage.getItem(DESKTOP_SIDEBAR_PINNED_KEY) !== "false";
}

function DeviceCard() {
  const [status, setStatus] = useState<DesktopDeviceStatus>({ state: "idle" });
  const [error, setError] = useState<string>();
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    void window.kontave.devices.getStatus().then(setStatus);
    return window.kontave.devices.subscribe((event) => {
      if (event.type === "device.state-changed") setStatus((current) => ({ ...current, state: event.state }));
      if (event.type === "device.connected") setStatus({ state: "ready", device: event.device });
      if (event.type === "device.disconnected") setStatus({ state: "reconnecting" });
      if (event.type === "device.failed") setError(event.failure.message);
    });
  }, []);

  async function connect(): Promise<void> {
    if (!clientInteractionAvailable()) return;
    setError(undefined);
    setConnecting(true);
    try { setStatus(await window.kontave.devices.connect()); }
    catch (cause: unknown) { setError(readErrorMessage(cause, "No se pudo conectar el dispositivo.")); }
    finally { setConnecting(false); }
  }

  return <Card className="device-card" aria-labelledby="device-title">
    <div className="device-heading">
      <div><Text className="desktop-label">Conexión local</Text><h2 id="device-title">Scanner de códigos</h2></div>
      <StatusBadge intent={statusIntent(status.state)}>{status.state}</StatusBadge>
    </div>
    <dl className="device-details">
      <dt>Equipo</dt><dd>{status.device ? `${status.device.manufacturer} ${status.device.model}` : "Sin dispositivo"}</dd>
      <dt>Conexión</dt><dd>{status.device?.connectionAddress ?? "—"}</dd>
    </dl>
    {error ? <Alert intent="danger">{error}</Alert> : null}
    <div className="device-actions">
      <Button loading={connecting} onClick={() => void connect()}>Conectar scanner</Button>
    </div>
  </Card>;
}

function accountDisplayName(auth: Extract<DesktopAuthState, { status: "authenticated" }>): string {
  const identity = auth.user.email ?? auth.user.id;
  return identity.includes("@") ? identity.slice(0, identity.indexOf("@")) : "Cuenta Kontave";
}

function moduleIcon(moduleId: string): ReactNode {
  if (moduleId === "payroll") return <Calculator />;
  if (moduleId === "purchases") return <ShoppingBasket />;
  if (moduleId === "sales") return <ShoppingCart />;
  if (moduleId === "inventory") return <Boxes />;
  if (moduleId === "accounting") return <BookOpen />;
  if (moduleId === "tools") return <Wrench />;
  if (moduleId === "companies") return <Building2 />;
  if (moduleId === "documents") return <Files />;
  return <Usb />;
}

function toSidebarWorkspace(entry: DesktopWorkspaceEntry) {
  // Renderer hot reload can temporarily retain state emitted by an older main
  // process. Preserve safe compatibility without ever promoting it to personal.
  const relationship = entry.relationship === "personal" || entry.relationship === "member" || entry.relationship === "delegated"
    ? entry.relationship
    : entry.access === "delegated" ? "delegated" : "member";
  return {
    id: entry.id,
    name: entry.name,
    relationship,
    ...(entry.avatarUrl ? { avatarUrl: entry.avatarUrl } : {}),
    description: relationship === "personal" ? "Mi cuenta"
      : relationship === "member" ? "Membresía directa"
      : "Acceso delegado",
  } as const;
}

function isExternalDestination(value: string): value is DesktopExternalDestination {
  return value === "settings" || value === "profile" || value === "help" || value === "billing" || value === "status";
}

function readErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function statusIntent(state: DesktopDeviceStatus["state"]): "neutral" | "success" | "warning" | "danger" {
  if (state === "ready") return "success";
  if (state === "requires-action") return "danger";
  if (state === "connecting" || state === "discovering" || state === "reconnecting") return "warning";
  return "neutral";
}
