import { useEffect, useState } from "react";
import markUrl from "@kontave/brand-assets/kontave-mark.svg";
import { Alert, Button, Card, PageShell, StatusBadge } from "@kontave/ui-web";
import type { DesktopDeviceStatus } from "../../shared/desktop-api.js";

export function App() {
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
    try {
      setStatus(await window.kontave.devices.connect());
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "No se pudo conectar el dispositivo.");
    } finally {
      setConnecting(false);
    }
  }

  return <PageShell>
    <header className="desktop-header">
      <img className="desktop-mark" src={markUrl} alt="" />
      <div><h1>Kontave Desktop</h1><p>Aplicación nativa de escritorio</p></div>
    </header>
    <Card className="device-card" aria-labelledby="device-title">
      <div className="device-heading">
        <div><span className="desktop-label">Dispositivos</span><h2 id="device-title">Administrador local</h2></div>
        <StatusBadge intent={statusIntent(status.state)}>{status.state}</StatusBadge>
      </div>
      <dl className="device-details">
        <dt>Equipo</dt><dd>{status.device ? `${status.device.manufacturer} ${status.device.model}` : "Sin dispositivo"}</dd>
        <dt>Conexión</dt><dd>{status.device?.connectionAddress ?? "—"}</dd>
      </dl>
      {error ? <Alert intent="danger">{error}</Alert> : null}
      <div className="device-actions"><Button loading={connecting} onClick={() => void connect()}>Conectar scanner</Button></div>
    </Card>
  </PageShell>;
}

function statusIntent(state: DesktopDeviceStatus["state"]): "neutral" | "success" | "warning" | "danger" {
  if (state === "ready") return "success";
  if (state === "requires-action") return "danger";
  if (state === "connecting" || state === "discovering" || state === "reconnecting") return "warning";
  return "neutral";
}
