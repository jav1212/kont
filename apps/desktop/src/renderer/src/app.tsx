import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { LogOut, Usb } from "lucide-react";
import { applyDesignTokens, type KontaveTheme } from "@kontave/design-tokens";
import { errorFeedback } from "@kontave/client-feedback-application";
import {
  Alert,
  Button,
  Card,
  StatusBadge,
  Text,
  WorkspaceSidebar,
  presentFeedback,
  type WorkspaceSidebarAccountAction,
  type WorkspaceSidebarModule,
  type WorkspaceSidebarSection,
} from "@kontave/ui-dom";
import type { DesktopAuthState, DesktopDeviceStatus, DesktopWorkspaceState } from "../../shared/desktop-api.js";
import type { ClientUpdateSnapshot } from "@kontave/client-updates-contracts";
import { AuthExperience } from "./auth/auth-experience.js";
import { clientInteractionAvailable, restoreDesktopSession } from "./client-interaction.js";
import { desktopConnectivityStore } from "./connectivity-store.js";

const DESKTOP_COMPACT_QUERY = "(max-width: 70rem)";
const DESKTOP_MODULES: readonly WorkspaceSidebarModule[] = [{
  id: "devices",
  label: "Dispositivos",
  subtitle: "Operación local",
  icon: <Usb />,
}];
const DESKTOP_SECTIONS: readonly WorkspaceSidebarSection[] = [{
  id: "local-operation",
  items: [{ id: "devices", active: true, icon: <Usb />, label: "Dispositivos" }],
}];
const DESKTOP_ACCOUNT_ACTIONS: readonly WorkspaceSidebarAccountAction[] = [{
  id: "sign-out",
  label: "Cerrar sesión",
  icon: <LogOut />,
  tone: "danger",
}];

export function App() {
  const [auth, setAuth] = useState<DesktopAuthState>({ status: "loading" });
  const [workspace, setWorkspace] = useState<DesktopWorkspaceState>({ status: "loading" });
  const [theme, setTheme] = useState<KontaveTheme>(() => localStorage.getItem("kontave.desktop.theme") === "dark" ? "dark" : "light");

  useEffect(() => {
    void restoreDesktopSession().then(setAuth).catch(() => undefined);
    return window.kontave.auth.subscribe(setAuth);
  }, []);

  useEffect(() => {
    void window.kontave.workspace.getState().then(setWorkspace).catch(() => undefined);
    return window.kontave.workspace.subscribe(setWorkspace);
  }, []);

  useEffect(() => {
    localStorage.setItem("kontave.desktop.theme", theme);
    applyDesignTokens(document.documentElement, theme);
  }, [theme]);

  if (auth.status === "authenticated") {
    return <DesktopAppShell auth={auth} workspace={workspace} theme={theme} onThemeChange={setTheme} onSignedOut={setAuth}>
      <DeviceCard />
    </DesktopAppShell>;
  }

  return <AuthExperience state={auth} onAuthenticated={setAuth} />;
}

function DesktopAppShell({ auth, children, onSignedOut, onThemeChange, theme, workspace }: {
  readonly auth: Extract<DesktopAuthState, { status: "authenticated" }>;
  readonly children: ReactNode;
  readonly onSignedOut: (state: DesktopAuthState) => void;
  readonly onThemeChange: (theme: KontaveTheme) => void;
  readonly theme: KontaveTheme;
  readonly workspace: DesktopWorkspaceState;
}) {
  const compactViewport = useCompactDesktopViewport();
  const connectivity = useSyncExternalStore(
    desktopConnectivityStore.subscribe,
    desktopConnectivityStore.getSnapshot,
    desktopConnectivityStore.getSnapshot,
  );

  function signOut(): void {
    if (!clientInteractionAvailable()) return;
    void window.kontave.auth.signOut().then((result) => {
      if (result.ok) onSignedOut(result.value);
    });
  }

  return <div className="desktop-shell">
    <WorkspaceSidebar
      presentation={compactViewport ? "collapsed" : "persistent"}
      modules={DESKTOP_MODULES}
      activeModuleId="devices"
      sections={DESKTOP_SECTIONS}
      account={{
        name: accountDisplayName(auth),
        email: auth.user.email ?? auth.user.id,
        theme,
        activeWorkspaceId: workspace.status === "ready" ? workspace.activeWorkspaceId : null,
        workspaceSectionLabel: "Cambiar espacio",
        workspaces: workspace.status === "ready" ? workspace.workspaces.map((entry) => ({
          id: entry.id,
          name: entry.name,
          ...(entry.avatarUrl ? { avatarUrl: entry.avatarUrl } : {}),
          description: entry.access === "direct" ? "Acceso directo" : "Acceso delegado",
          ...(entry.access === "delegated" ? { badge: "Delegado" } : {}),
        })) : [],
      }}
      accountActions={DESKTOP_ACCOUNT_ACTIONS}
      onSelectWorkspace={(workspaceId) => {
        if (!clientInteractionAvailable()) return;
        void window.kontave.workspace.select(workspaceId).then((result) => {
          if (result.ok) return;
          presentFeedback.execute(errorFeedback(result.error.message, { deduplicationKey: "workspace-selection-failed" }));
        });
      }}
      onThemeChange={onThemeChange}
      onAccountAction={(actionId) => {
        if (actionId === "sign-out") signOut();
      }}
    />

    <div className="desktop-workspace">
      <header className="desktop-toolbar">
        <div>
          <h1>Dispositivos</h1>
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

function readErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function statusIntent(state: DesktopDeviceStatus["state"]): "neutral" | "success" | "warning" | "danger" {
  if (state === "ready") return "success";
  if (state === "requires-action") return "danger";
  if (state === "connecting" || state === "discovering" || state === "reconnecting") return "warning";
  return "neutral";
}
