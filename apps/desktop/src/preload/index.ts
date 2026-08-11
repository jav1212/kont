import { contextBridge, ipcRenderer } from "electron";
import type { DeviceEvent } from "@kontave/device-contracts";
import { DESKTOP_IPC, type KontaveDesktopApi } from "../shared/desktop-api.js";

const api: KontaveDesktopApi = {
  auth: {
    getState: () => ipcRenderer.invoke(DESKTOP_IPC.getAuthState),
    signIn: (command) => ipcRenderer.invoke(DESKTOP_IPC.signIn, command),
    signOut: () => ipcRenderer.invoke(DESKTOP_IPC.signOut),
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => listener(payload);
      ipcRenderer.on(DESKTOP_IPC.authStateChanged, handler);
      return () => ipcRenderer.off(DESKTOP_IPC.authStateChanged, handler);
    },
  },
  devices: {
    connect: () => ipcRenderer.invoke(DESKTOP_IPC.connectDevice),
    disconnect: () => ipcRenderer.invoke(DESKTOP_IPC.disconnectDevice),
    getStatus: () => ipcRenderer.invoke(DESKTOP_IPC.getDeviceStatus),
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, payload: DeviceEvent) => listener(payload);
      ipcRenderer.on(DESKTOP_IPC.deviceEvent, handler);
      return () => ipcRenderer.off(DESKTOP_IPC.deviceEvent, handler);
    },
  },
};

contextBridge.exposeInMainWorld("kontave", api);
