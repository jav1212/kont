import { useEffect, useState, type FormEvent } from "react";
import markUrl from "@kontave/brand-assets/kontave-mark.svg";
import { Alert, Button, Card, PageShell, StatusBadge, TextField } from "@kontave/ui-web";
import type { DesktopAuthState, DesktopDeviceStatus } from "../../shared/desktop-api.js";

export function App() {
  const [auth, setAuth] = useState<DesktopAuthState>({ status: "loading" });

  useEffect(() => {
    void window.kontave.auth.getState().then(setAuth);
    return window.kontave.auth.subscribe(setAuth);
  }, []);

  return <PageShell>
    <DesktopHeader />
    {auth.status === "loading" ? <Card className="auth-card">Restaurando sesión segura…</Card> : null}
    {auth.status === "anonymous" ? <SignInCard onAuthenticated={setAuth} /> : null}
    {auth.status === "authenticated" ? <DeviceCard auth={auth} onSignedOut={setAuth} /> : null}
  </PageShell>;
}

function DesktopHeader() {
  return <header className="desktop-header">
    <img className="desktop-mark" src={markUrl} alt="" />
    <div><h1>Kontave Desktop</h1><p>Aplicación nativa de escritorio</p></div>
  </header>;
}

function SignInCard({ onAuthenticated }: { readonly onAuthenticated: (state: DesktopAuthState) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    setLoading(true);
    try {
      onAuthenticated(await window.kontave.auth.signIn({ email, password }));
    } catch (cause: unknown) {
      setError(readErrorMessage(cause, "No se pudo iniciar sesión."));
    } finally {
      setLoading(false);
    }
  }

  return <Card className="auth-card" aria-labelledby="sign-in-title">
    <div><span className="desktop-label">Cuenta Kontave</span><h2 id="sign-in-title">Iniciar sesión</h2></div>
    <form className="auth-form" onSubmit={(event) => void submit(event)}>
      <TextField label="Correo electrónico" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <TextField label="Contraseña" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      {error ? <Alert intent="danger">{error}</Alert> : null}
      <Button type="submit" loading={loading}>Continuar</Button>
    </form>
  </Card>;
}

function DeviceCard({ auth, onSignedOut }: {
  readonly auth: Extract<DesktopAuthState, { status: "authenticated" }>;
  readonly onSignedOut: (state: DesktopAuthState) => void;
}) {
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
      <div><span className="desktop-label">Dispositivos</span><h2 id="device-title">Administrador local</h2></div>
      <StatusBadge intent={statusIntent(status.state)}>{status.state}</StatusBadge>
    </div>
    <p className="signed-in-user">Sesión: {auth.user.email ?? auth.user.id}</p>
    <dl className="device-details">
      <dt>Equipo</dt><dd>{status.device ? `${status.device.manufacturer} ${status.device.model}` : "Sin dispositivo"}</dd>
      <dt>Conexión</dt><dd>{status.device?.connectionAddress ?? "—"}</dd>
    </dl>
    {error ? <Alert intent="danger">{error}</Alert> : null}
    <div className="device-actions">
      <Button loading={connecting} onClick={() => void connect()}>Conectar scanner</Button>
      <Button intent="neutral" onClick={() => void window.kontave.auth.signOut().then(onSignedOut)}>Cerrar sesión</Button>
    </div>
  </Card>;
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
