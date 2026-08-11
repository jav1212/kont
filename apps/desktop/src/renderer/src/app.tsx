import { useEffect, useState } from "react";
import type { DesktopDeviceStatus } from "../../shared/desktop-api.js";

export function App() {
  const [status, setStatus] = useState<DesktopDeviceStatus>({ state: "idle" });
  const [error, setError] = useState<string>();

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
    try { setStatus(await window.kontave.devices.connect()); }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "No se pudo conectar el dispositivo."); }
  }

  return <main className="shell">
    <header><span className="mark">K</span><div><h1>Kontave Desktop</h1><p>Aplicación nativa de escritorio</p></div></header>
    <section className="card">
      <div><span className="label">Dispositivos</span><h2>{status.state}</h2></div>
      <dl><dt>Equipo</dt><dd>{status.device ? `${status.device.manufacturer} ${status.device.model}` : "Sin dispositivo"}</dd><dt>Conexión</dt><dd>{status.device?.connectionAddress ?? "—"}</dd></dl>
      {error ? <p className="error">{error}</p> : null}
      <button type="button" onClick={() => void connect()}>Conectar scanner</button>
    </section>
  </main>;
}
