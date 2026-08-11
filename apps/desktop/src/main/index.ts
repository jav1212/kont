import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import type { DeviceEvent, DeviceFailure } from "@kontave/device-contracts";
import { DeviceManager, ExponentialBackoffPolicy, type DeviceEventSink, type DeviceLogger } from "@kontave/devices-core";
import { DatalogicQw2100Adapter, NodeSerialPortProvider } from "@kontave/devices-node";
import { DESKTOP_IPC, type DesktopDeviceStatus } from "../shared/desktop-api.js";

let mainWindow: BrowserWindow | undefined;

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

function registerIpc(): void {
  ipcMain.handle(DESKTOP_IPC.connectDevice, () => devices.connect());
  ipcMain.handle(DESKTOP_IPC.disconnectDevice, () => devices.disconnect());
  ipcMain.handle(DESKTOP_IPC.getDeviceStatus, () => devices.status());
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
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
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void devices.disconnect();
});
