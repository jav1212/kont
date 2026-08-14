import { useEffect, useState, type ReactNode } from "react";
import { LogOut, PanelLeftClose, PanelLeftOpen, Usb } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  LogoFull,
  LogoMark,
  Sidebar,
  SidebarAction,
  SidebarFooter,
  SidebarHeader,
  SidebarNav,
  SidebarSection,
  StatusBadge,
  type SidebarPresentation,
} from "@kontave/ui-dom";
import type { DesktopAuthState, DesktopDeviceStatus } from "../../shared/desktop-api.js";
import { AuthExperience } from "./auth/auth-experience.js";

const DESKTOP_COMPACT_QUERY = "(max-width: 70rem)";
const SIDEBAR_PREFERENCE_KEY = "kontave.desktop.sidebar-collapsed";

export function App() {
  const [auth, setAuth] = useState<DesktopAuthState>({ status: "loading" });

  useEffect(() => {
    void window.kontave.auth.getState().then(setAuth);
    return window.kontave.auth.subscribe(setAuth);
  }, []);

  if (auth.status === "authenticated") {
    return <DesktopAppShell auth={auth} onSignedOut={setAuth}>
      <DeviceCard />
    </DesktopAppShell>;
  }

  return <AuthExperience state={auth} onAuthenticated={setAuth} />;
}

function DesktopAppShell({ auth, children, onSignedOut }: {
  readonly auth: Extract<DesktopAuthState, { status: "authenticated" }>;
  readonly children: ReactNode;
  readonly onSignedOut: (state: DesktopAuthState) => void;
}) {
  const compactViewport = useCompactDesktopViewport();
  const [userCollapsed, setUserCollapsed] = useState(() => localStorage.getItem(SIDEBAR_PREFERENCE_KEY) === "true");
  const presentation: SidebarPresentation = compactViewport || userCollapsed ? "collapsed" : "expanded";
  const collapsed = presentation === "collapsed";

  function toggleSidebar(): void {
    const next = !userCollapsed;
    setUserCollapsed(next);
    localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(next));
  }

  function signOut(): void {
    void window.kontave.auth.signOut().then((result) => {
      if (result.ok) onSignedOut(result.value);
    });
  }

  return <div className="desktop-shell">
    <Sidebar
      presentation={presentation}
      aria-label="Navegación principal"
      className={compactViewport ? "desktop-sidebar desktop-sidebar--viewport-compact" : "desktop-sidebar"}
    >
      <SidebarHeader className="desktop-sidebar-header">
        <div className="desktop-sidebar-brand">
          {collapsed ? <LogoMark size={24} /> : <LogoFull size={24} />}
        </div>
        {!compactViewport ? <Button
          appearance="text"
          size="sm"
          className="desktop-sidebar-toggle"
          aria-label={collapsed ? "Expandir navegación" : "Contraer navegación"}
          title={collapsed ? "Expandir navegación" : "Contraer navegación"}
          onClick={toggleSidebar}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button> : null}
      </SidebarHeader>

      <SidebarNav aria-label="Secciones de Kontave">
        <SidebarSection label="Operación local">
          <SidebarAction active icon={<Usb />} label="Dispositivos" />
        </SidebarSection>
      </SidebarNav>

      <SidebarFooter>
        <div className="desktop-sidebar-account" title={auth.user.email ?? auth.user.id}>
          <span className="desktop-sidebar-avatar" aria-hidden="true">{accountInitial(auth)}</span>
          <span className="desktop-sidebar-account-copy">
            <strong>Cuenta Kontave</strong>
            <span>{auth.user.email ?? auth.user.id}</span>
          </span>
        </div>
        <SidebarAction icon={<LogOut />} label="Cerrar sesión" onClick={signOut} />
      </SidebarFooter>
    </Sidebar>

    <div className="desktop-workspace">
      <header className="desktop-toolbar">
        <div>
          <h1>Dispositivos</h1>
        </div>
      </header>
      <main className="desktop-content">{children}</main>
    </div>
  </div>;
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
    setError(undefined);
    setConnecting(true);
    try { setStatus(await window.kontave.devices.connect()); }
    catch (cause: unknown) { setError(readErrorMessage(cause, "No se pudo conectar el dispositivo.")); }
    finally { setConnecting(false); }
  }

  return <Card className="device-card" aria-labelledby="device-title">
    <div className="device-heading">
      <div><span className="desktop-label">Conexión local</span><h2 id="device-title">Scanner de códigos</h2></div>
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

function accountInitial(auth: Extract<DesktopAuthState, { status: "authenticated" }>): string {
  return (auth.user.email ?? auth.user.id).trim().charAt(0).toLocaleUpperCase("es");
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
