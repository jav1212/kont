import { app, BrowserWindow, dialog, Menu, nativeImage, shell, Tray } from "electron";
import { ClientUpdateCoordinator } from "@kontave/client-updates-application";
import { createElectronClientUpdateProvider } from "@kontave/client-updates-electron";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DeviceManager, type ManagerSnapshot } from "../core/device-manager";
import { configPath, loadConfig, saveConfig } from "../core/config";
import { Logger } from "../core/logger";
import { DeviceGateway } from "../gateway/device-gateway";

let tray: Tray | null = null; let window: BrowserWindow | null = null; let manager: DeviceManager | null = null; let updates: ClientUpdateCoordinator | null = null;
const logger = new Logger();
const lastReportedError = new Map<string, number>();
process.on("uncaughtException", (error) => logger.error("Excepción no controlada", error.stack ?? error.message));
process.on("unhandledRejection", (reason) => logger.error("Promesa rechazada", String(reason)));
const assetPath = (name: string) => app.isPackaged ? join(process.resourcesPath, "assets", name) : join(app.getAppPath(), "assets", name);
const icon = nativeImage.createFromPath(assetPath("kontave-icon.png"));
const trayIcon = nativeImage.createFromPath(assetPath("kontave-tray.png"));
const favicon = `data:image/png;base64,${readFileSync(assetPath("kontave-tray.png")).toString("base64")}`;

function diagnosticsHtml(state: ManagerSnapshot): string {
  const escape = (value: unknown) => String(value ?? "—").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><link rel="icon" href="${favicon}"><title>Kontave Device Manager</title><style>body{font:14px system-ui;margin:0;background:#f5f7fb;color:#162033}.head{background:#0b0c14;color:white;padding:24px;display:flex;align-items:center;gap:14px}.brand{width:44px;height:44px}.head h2{margin:0}.head div div{margin-top:4px;color:#c6c8d2}main{padding:24px}.card{background:white;border:1px solid #dde3ed;border-radius:12px;padding:18px;margin-bottom:14px}.status{font-weight:700;text-transform:capitalize}.ok{color:#16803c}.bad{color:#b42318}dt{color:#667085;margin-top:12px}dd{margin:3px 0 0;font-weight:600}.foot{color:#667085;font-size:12px}</style><div class="head"><img class="brand" src="${favicon}" alt=""><div><h2>Kontave Device Manager</h2><div>Centro local de dispositivos</div></div></div><main><div class="card"><div class="status ${state.status === "connected" ? "ok" : "bad"}">${escape(state.status)}</div><dl><dt>Dispositivo</dt><dd>${escape(state.device ? `${state.device.manufacturer} ${state.device.model}` : null)}</dd><dt>Conexión</dt><dd>${escape(state.device?.connection)}</dd><dt>Gateway</dt><dd>${escape(state.gatewayUrl)}</dd><dt>Último error</dt><dd>${escape(state.lastError)}</dd></dl></div><p class="foot">La aplicación continúa funcionando al cerrar esta ventana. Usa el icono de la bandeja para salir.</p></main></html>`;
}
function showWindow(state = manager?.getSnapshot()): void {
  if (!state) return; if (!window) { window = new BrowserWindow({ width: 500, height: 530, resizable: false, icon, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } }); window.on("closed", () => { window = null; }); }
  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(diagnosticsHtml(state))}`); window.show();
}
function updateTray(state: ManagerSnapshot): void {
  if (!tray) return; tray.setToolTip(`Kontave Device Manager — ${state.status}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Estado: ${state.status}`, enabled: false },
    { label: state.device ? `${state.device.model} (${state.device.connection})` : "Sin dispositivo", enabled: false },
    { type: "separator" }, { label: "Abrir diagnóstico", click: () => showWindow() },
    { label: "Abrir registros", click: () => void shell.showItemInFolder(logger.path) }, { label: "Abrir configuración", click: () => void shell.showItemInFolder(configPath) },
    { type: "separator" }, { label: "Buscar actualizaciones", click: () => void checkForClientUpdate(true) },
    { label: "Salir", click: () => app.quit() },
  ]));
  if (window?.isVisible()) showWindow(state);
}

async function checkForClientUpdate(interactive: boolean): Promise<void> {
  if (!updates) return;
  try {
    const checked = await updates.check();
    if (checked.status === "up-to-date") {
      if (interactive) await dialog.showMessageBox({ type: "info", message: "Kontave Device Manager está actualizado." });
      return;
    }
    if (checked.status === "failed") {
      logger.error("Comprobación de actualizaciones fallida", checked.failure.code);
      if (interactive) dialog.showErrorBox("Actualizaciones", "No se pudo comprobar si existe una actualización. Intenta nuevamente más tarde.");
      return;
    }
    if (checked.status !== "available") return;
    const response = await dialog.showMessageBox({
      type: "info",
      buttons: ["Después", "Descargar"],
      defaultId: 1,
      cancelId: 0,
      message: `Kontave Device Manager ${checked.release.productVersion} está disponible.`,
      detail: "Puedes seguir usando la aplicación mientras se descarga.",
    });
    if (response.response !== 1) return;
    const downloaded = await updates.download();
    if (downloaded.status === "failed") {
      logger.error("Descarga de actualización fallida", downloaded.failure.code);
      dialog.showErrorBox("Actualizaciones", "No se pudo descargar la actualización. Intenta nuevamente más tarde.");
      return;
    }
    if (downloaded.status !== "ready") return;
    const install = await dialog.showMessageBox({
      type: "info",
      buttons: ["Instalar después", "Reiniciar e instalar"],
      defaultId: 1,
      cancelId: 0,
      message: "La actualización está lista para instalarse.",
      detail: "Kontave Device Manager solo se cerrará si eliges reiniciar ahora.",
    });
    if (install.response === 1) {
      await updates.apply();
    }
  } catch (error: unknown) {
    logger.error("Operación de actualización fallida", String(error));
  }
}

async function ensureTls(owner: BrowserWindow): Promise<void> {
  const current = loadConfig();
  if (current.tlsPfxPath) return;
  await dialog.showMessageBox(owner, { type: "info", buttons: ["Configurar conexión segura"], defaultId: 0, title: "Configuración inicial", message: "Kontave necesita autorizar una conexión segura con este equipo.", detail: "A continuación Windows solicitará confirmar un certificado válido únicamente para localhost. No concede acceso desde Internet." });
  const script = app.isPackaged ? join(process.resourcesPath, "assets", "setup-local-tls.ps1") : join(app.getAppPath(), "assets", "setup-local-tls.ps1");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-ConfigPath", configPath], { windowsHide: true, stdio: "ignore" });
    child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`PowerShell terminó con código ${code}`)));
  });
}

const initialState: ManagerSnapshot = { status: "connecting", device: null, lastError: "Completando la configuración inicial…", gatewayUrl: null };
const hasSingleInstanceLock = app.requestSingleInstanceLock();
async function startApplication(): Promise<void> {
  logger.info("Esperando a que Electron esté listo", { version: app.getVersion(), packaged: app.isPackaged, args: process.argv });
  await app.whenReady();
  logger.info("Electron listo");

  updates = new ClientUpdateCoordinator(createElectronClientUpdateProvider({
    enabled: app.isPackaged,
    installed: {
      product: "kontave-device-manager",
      platform: process.platform,
      architecture: process.arch,
      channel: "production",
      productVersion: app.getVersion(),
      buildNumber: null,
      runtimeVersion: null,
      apiVersion: "device-protocol-v1",
    },
  }), undefined, {
    record: (operation, cause, code) => logger.error(`Actualización ${operation} falló [${code}]`, String(cause)),
  });

  app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] });
  tray = new Tray(trayIcon);
  tray.on("double-click", () => showWindow());
  if (!process.argv.includes("--hidden") || !loadConfig().tlsPfxPath) showWindow(initialState);

  logger.info("Verificando configuración TLS");
  try {
    await ensureTls(window!);
    logger.info("Configuración TLS disponible");
  } catch (error) {
    logger.error("No se pudo configurar TLS", String(error));
    dialog.showErrorBox("Conexión segura", "No fue posible configurar el certificado local. Cierra la aplicación desde la bandeja y vuelve a abrirla para reintentar.");
  }

  const config = loadConfig();
  saveConfig(config);
  const gateway = new DeviceGateway(config, app.getVersion(), async ({ clientName, origin }) => (await dialog.showMessageBox({ type: "question", buttons: ["Rechazar", "Permitir"], defaultId: 1, cancelId: 0, title: "Emparejar con Kontave", message: `${clientName} solicita acceso a los dispositivos`, detail: `Origen: ${origin}\n\nPermite únicamente si tú abriste Kontave en este equipo.` })).response === 1);
  logger.onError(({ message, detail, occurredAt }) => {
    const reportMessage = detail ? `${message}: ${detail}` : message;
    const now = Date.now();
    const previous = lastReportedError.get(reportMessage) ?? 0;
    if (now - previous < 5 * 60_000) return;
    lastReportedError.set(reportMessage, now);
    gateway.broadcast({ type: "manager.error", code: "DEVICE_MANAGER_ERROR", message: reportMessage, eventId: randomUUID(), occurredAt, managerVersion: app.getVersion(), installId: config.installId });
  });
  manager = new DeviceManager(config, gateway, logger);
  manager.onChange(updateTray);
  try {
    await manager.start();
  } catch (error) {
    logger.error("Inicio fallido", String(error));
    dialog.showErrorBox("Kontave Device Manager", "No se pudo iniciar el servicio local. Revisa los registros.");
  }
  if (!process.argv.includes("--hidden")) showWindow();

  if (app.isPackaged) setTimeout(() => void checkForClientUpdate(false), 15_000);
}

if (!hasSingleInstanceLock) {
  app.exit(0);
} else {
  logger.info("Proceso principal iniciado");
  app.on("second-instance", () => showWindow(manager?.getSnapshot() ?? initialState));
  app.on("window-all-closed", () => undefined);
  app.on("before-quit", () => { void manager?.stop(); });
  void startApplication().catch((error: unknown) => {
    logger.error("Fallo fatal durante el arranque", error instanceof Error ? error.stack ?? error.message : String(error));
    if (app.isReady()) dialog.showErrorBox("Kontave Device Manager", "La aplicación no pudo iniciarse. Revisa los registros para obtener más información.");
    app.exit(1);
  });
}
