import { contextBridge, ipcRenderer } from "electron";
import type { DeviceEvent } from "@kontave/device-contracts";
import type { ClientUpdateSnapshot } from "@kontave/client-updates-contracts";
import { DESKTOP_IPC, type KontaveDesktopApi } from "../shared/desktop-api.js";

const api: KontaveDesktopApi = {
  auth: {
    getState: () => ipcRenderer.invoke(DESKTOP_IPC.getAuthState),
    signIn: (command) => ipcRenderer.invoke(DESKTOP_IPC.signIn, command),
    register: (command) => ipcRenderer.invoke(DESKTOP_IPC.register, command),
    verifyRegistration: (command) => ipcRenderer.invoke(DESKTOP_IPC.verifyRegistration, command),
    resendRegistration: (command) => ipcRenderer.invoke(DESKTOP_IPC.resendRegistration, command),
    requestPasswordRecovery: (command) => ipcRenderer.invoke(DESKTOP_IPC.requestPasswordRecovery, command),
    verifyPasswordRecovery: (command) => ipcRenderer.invoke(DESKTOP_IPC.verifyPasswordRecovery, command),
    completePasswordRecovery: (command) => ipcRenderer.invoke(DESKTOP_IPC.completePasswordRecovery, command),
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
  updates: {
    getState: () => ipcRenderer.invoke(DESKTOP_IPC.getUpdateState),
    check: () => ipcRenderer.invoke(DESKTOP_IPC.checkForUpdate),
    download: () => ipcRenderer.invoke(DESKTOP_IPC.downloadUpdate),
    apply: () => ipcRenderer.invoke(DESKTOP_IPC.applyUpdate),
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, payload: ClientUpdateSnapshot) => listener(payload);
      ipcRenderer.on(DESKTOP_IPC.updateStateChanged, handler);
      return () => ipcRenderer.off(DESKTOP_IPC.updateStateChanged, handler);
    },
  },
};

contextBridge.exposeInMainWorld("kontave", api);
