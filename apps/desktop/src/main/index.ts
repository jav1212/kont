import { app, BrowserWindow, ipcMain, Menu, powerMonitor, shell } from "electron";
import { join } from "node:path";
import type { DeviceEvent, DeviceFailure } from "@kontave/device-contracts";
import { DeviceManager, ExponentialBackoffPolicy, type DeviceEventSink, type DeviceLogger } from "@kontave/devices-core";
import { DatalogicQw2100Adapter, NodeSerialPortProvider } from "@kontave/devices-node";
import { createSupabaseAuthenticationGateway } from "@kontave/auth-supabase";
import { AuthenticationFailure } from "@kontave/auth-domain";
import { ConnectivityMonitor } from "@kontave/client-connectivity-application";
import type { ConnectivitySnapshot } from "@kontave/client-connectivity-contracts";
import { ClientUpdateCoordinator } from "@kontave/client-updates-application";
import { createElectronClientUpdateProvider } from "@kontave/client-updates-electron";
import { WorkspaceContextSession } from "@kontave/workspace-context-application";
import { DESKTOP_IPC, type DesktopAuthResult, type DesktopDeviceStatus } from "../shared/desktop-api.js";
import { DesktopAuthController } from "./auth/desktop-auth-controller.js";
import { DesktopSecureStorage } from "./auth/desktop-secure-storage.js";
import { FetchConnectivityProbe } from "./connectivity/fetch-connectivity-probe.js";
import { DesktopWorkspaceController } from "./workspace/desktop-workspace-controller.js";
import { DesktopWorkspacePortfolioSource } from "./workspace/desktop-workspace-portfolio-source.js";
import { DesktopWorkspaceSelectionStore } from "./workspace/desktop-workspace-selection-store.js";

let mainWindow: BrowserWindow | undefined;
let updates: ClientUpdateCoordinator | undefined;
let workspace: DesktopWorkspaceController | undefined;
let connectivity: ConnectivityMonitor | undefined;
let connectivityInterval: ReturnType<typeof setInterval> | undefined;
let initialization: Promise<void> | undefined;

class DesktopDeviceHost implements DeviceEventSink, DeviceLogger {
  private readonly manager = new DeviceManager({
    adapters: [
      new DatalogicQw2100Adapter(new NodeSerialPortProvider(), {
        ...(process.env.KONTAVE_SCANNER_PORT ? { serialPort: process.env.KONTAVE_SCANNER_PORT } : {}),
      }),
    ],
    events: this,
    logger: this,
  });

  async connect(): Promise<DesktopDeviceStatus> {
    await this.manager.connectFirst("barcode.scan", {
      reconnection: new ExponentialBackoffPolicy(5, 1_000, 30_000),
    });
    return this.status();
  }

  async disconnect(): Promise<DesktopDeviceStatus> {
    await this.manager.stop();
    return this.status();
  }

  status(): DesktopDeviceStatus {
    const device = this.manager.connectedDevice;
    return device === undefined
      ? { state: this.manager.state }
      : { state: this.manager.state, device };
  }

  publish(event: DeviceEvent): void {
    mainWindow?.webContents.send(DESKTOP_IPC.deviceEvent, event);
  }

  info(code: string, context?: Readonly<Record<string, unknown>>): void {
    console.info(JSON.stringify({ level: "info", code, context }));
  }

  error(failure: DeviceFailure, context?: Readonly<Record<string, unknown>>): void {
    console.error(JSON.stringify({ level: "error", failure, context }));
  }
}

const devices = new DesktopDeviceHost();
let auth: DesktopAuthController | undefined;

function registerIpc(): void {
  ipcMain.handle(DESKTOP_IPC.getAuthState, async () => {
    await initialization;
    return auth?.getState() ?? { status: "loading" };
  });
  ipcMain.handle(DESKTOP_IPC.signIn, (_event, command: unknown) => runAuthOperation(async (controller) => synchronizeWorkspace(await controller.signIn(command))));
  ipcMain.handle(DESKTOP_IPC.register, (_event, command: unknown) => runAuthOperation((controller) => controller.register(command)));
  ipcMain.handle(DESKTOP_IPC.verifyRegistration, (_event, command: unknown) => runAuthOperation(async (controller) => synchronizeWorkspace(await controller.verifyRegistration(command))));
  ipcMain.handle(DESKTOP_IPC.resendRegistration, (_event, command: unknown) => runAuthOperation((controller) => controller.resendRegistration(command)));
  ipcMain.handle(DESKTOP_IPC.requestPasswordRecovery, (_event, command: unknown) => runAuthOperation((controller) => controller.requestPasswordRecovery(command)));
  ipcMain.handle(DESKTOP_IPC.verifyPasswordRecovery, (_event, command: unknown) => runAuthOperation((controller) => controller.verifyPasswordRecovery(command)));
  ipcMain.handle(DESKTOP_IPC.completePasswordRecovery, (_event, command: unknown) => runAuthOperation(async (controller) => synchronizeWorkspace(await controller.completePasswordRecovery(command))));
  ipcMain.handle(DESKTOP_IPC.signOut, () => runAuthOperation(async (controller) => synchronizeWorkspace(await controller.signOut())));
  ipcMain.handle(DESKTOP_IPC.connectDevice, () => devices.connect());
  ipcMain.handle(DESKTOP_IPC.disconnectDevice, () => devices.disconnect());
  ipcMain.handle(DESKTOP_IPC.getDeviceStatus, () => devices.status());
  ipcMain.handle(DESKTOP_IPC.getUpdateState, () => updateCoordinator().getSnapshot());
  ipcMain.handle(DESKTOP_IPC.checkForUpdate, () => updateCoordinator().check());
  ipcMain.handle(DESKTOP_IPC.downloadUpdate, () => updateCoordinator().download());
  ipcMain.handle(DESKTOP_IPC.applyUpdate, () => updateCoordinator().apply());
  ipcMain.handle(DESKTOP_IPC.getWorkspaceState, async () => {
    await initialization;
    return workspaceController().getState();
  });
  ipcMain.handle(DESKTOP_IPC.selectWorkspace, (_event, workspaceId: unknown) => workspaceController().select(workspaceId));
  ipcMain.handle(DESKTOP_IPC.getConnectivitySnapshot, () => connectivityMonitor().getSnapshot());
  ipcMain.handle(DESKTOP_IPC.refreshConnectivity, () => connectivityMonitor().refresh());
}

function updateCoordinator(): ClientUpdateCoordinator {
  if (!updates) throw new Error("Desktop updates are not initialized.");
  return updates;
}

function workspaceController(): DesktopWorkspaceController {
  if (!workspace) throw new Error("Desktop workspace context is not initialized.");
  return workspace;
}

function connectivityMonitor(): ConnectivityMonitor {
  if (!connectivity) throw new Error("Desktop connectivity is not initialized.");
  return connectivity;
}

async function synchronizeWorkspace(state: Awaited<ReturnType<DesktopAuthController["initialize"]>>) {
  if (state.status !== "authenticated") {
    await workspaceController().clear();
    return state;
  }
  if (blocksRemoteOperations(connectivityMonitor().getSnapshot())) workspaceController().markUnavailable();
  else await workspaceController().initialize();
  return state;
}

function blocksRemoteOperations(snapshot: ConnectivitySnapshot): boolean {
  return snapshot.availability === "unavailable"
    || (snapshot.availability === "unknown" && snapshot.reason !== null);
}

function publishConnectivity(): void {
  const snapshot = connectivityMonitor().getSnapshot();
  mainWindow?.webContents.send(DESKTOP_IPC.connectivityChanged, snapshot);
  if (
    snapshot.availability === "available"
    && auth?.getState().status === "authenticated"
    && workspaceController().getState().status === "unavailable"
  ) {
    void workspaceController().initialize().catch((cause: unknown) => {
      console.error(JSON.stringify({
        level: "error",
        code: "DESKTOP_WORKSPACE_REFRESH_FAILED",
        message: cause instanceof Error ? cause.message : "Unknown workspace refresh failure",
      }));
    });
  }
}

async function runAuthOperation<T>(operation: (controller: DesktopAuthController) => Promise<T>): Promise<DesktopAuthResult<T>> {
  if (!auth) return { ok: false, error: { code: "UNEXPECTED", message: "La autenticación todavía no está disponible." } };
  try {
    return { ok: true, value: await operation(auth) };
  } catch (cause: unknown) {
    if (cause instanceof AuthenticationFailure) {
      return { ok: false, error: { code: cause.code, message: cause.message } };
    }
    console.error(JSON.stringify({ level: "error", code: "AUTH_UNEXPECTED_FAILURE" }));
    return { ok: false, error: { code: "UNEXPECTED", message: "Ocurrió un error inesperado. Intenta nuevamente." } };
  }
}

function createWindow(): void {
  const icon = app.isPackaged
    ? join(process.resourcesPath, "kontave-icon.png")
    : join(app.getAppPath(), "../../packages/ui/brand-assets/src/kontave-icon.png");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    icon,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("console-message", (details) => {
    if (details.level === "error" || details.level === "warning") {
      console.error(JSON.stringify({
        level: details.level,
        code: "DESKTOP_RENDERER_CONSOLE",
        message: details.message,
        source: details.sourceId,
        line: details.lineNumber,
      }));
    }
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error(JSON.stringify({ level: "error", code: "DESKTOP_RENDERER_LOAD_FAILED", errorCode, errorDescription, validatedURL, isMainFrame }));
  });
  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(JSON.stringify({ level: "error", code: "DESKTOP_PRELOAD_FAILED", preloadPath, message: error.message }));
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(JSON.stringify({ level: "error", code: "DESKTOP_RENDERER_GONE", reason: details.reason, exitCode: details.exitCode }));
  });
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  const supabaseUrl = import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? import.meta.env.KONTAVE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? import.meta.env.KONTAVE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY son obligatorias para Desktop.");
  }
  auth = new DesktopAuthController(
    createSupabaseAuthenticationGateway({ url: supabaseUrl, anonKey: supabaseAnonKey }, new DesktopSecureStorage()),
    () => mainWindow,
  );
  const apiBaseUrl = import.meta.env.KONTAVE_API_URL ?? "https://kontave.com";
  connectivity = new ConnectivityMonitor({
    probe: new FetchConnectivityProbe(new URL("/api/native/v1/organization-access", apiBaseUrl).toString()),
    failureThreshold: 3,
    unexpectedFailureObserver: {
      record: (cause) => console.error(JSON.stringify({
        level: "error",
        code: "DESKTOP_CONNECTIVITY_PROBE_FAILED",
        message: cause instanceof Error ? cause.message : "Unknown connectivity probe failure",
      })),
    },
  });
  workspace = new DesktopWorkspaceController(
    new WorkspaceContextSession(
      new DesktopWorkspacePortfolioSource(apiBaseUrl, () => auth?.getAccessToken() ?? Promise.resolve(null)),
      new DesktopWorkspaceSelectionStore(),
    ),
    () => mainWindow,
  );
  updates = new ClientUpdateCoordinator(createElectronClientUpdateProvider({
    enabled: app.isPackaged,
    installed: {
      product: "kontave-desktop",
      platform: process.platform,
      architecture: process.arch,
      channel: "production",
      productVersion: app.getVersion(),
      buildNumber: null,
      runtimeVersion: null,
      apiVersion: "v1",
    },
  }), undefined, {
    record: (operation, cause, code) => console.error(JSON.stringify({
      level: "error",
      code,
      operation,
      message: cause instanceof Error ? cause.message : "Unknown update failure",
    })),
  });
  updates.subscribe(() => mainWindow?.webContents.send(DESKTOP_IPC.updateStateChanged, updateCoordinator().getSnapshot()));
  connectivity.subscribe(publishConnectivity);
  Menu.setApplicationMenu(null);
  registerIpc();
  initialization = auth.initialize()
    .then(async (state) => {
      await connectivityMonitor().refresh();
      return synchronizeWorkspace(state);
    })
    .then(() => undefined);
  void initialization.catch((cause: unknown) => {
    console.error(JSON.stringify({
      level: "error",
      code: "DESKTOP_INITIALIZATION_FAILED",
      message: cause instanceof Error ? cause.message : "Unknown desktop initialization failure",
    }));
  });
  createWindow();
  connectivityInterval = setInterval(() => void connectivityMonitor().refresh(), 30_000);
  powerMonitor.on("resume", () => void connectivityMonitor().refresh());
  if (app.isPackaged) setTimeout(() => void updates?.check(), 15_000);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (connectivityInterval) clearInterval(connectivityInterval);
  void devices.disconnect();
});
