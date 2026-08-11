import type { DeviceDescriptor, DeviceEvent, DeviceLifecycleState } from "@kontave/device-contracts";

export const DESKTOP_IPC = {
  connectDevice: "devices:connect",
  disconnectDevice: "devices:disconnect",
  getDeviceStatus: "devices:status",
  deviceEvent: "devices:event",
} as const;

export interface DesktopDeviceStatus {
  readonly state: DeviceLifecycleState;
  readonly device?: DeviceDescriptor;
}

export interface KontaveDesktopApi {
  readonly devices: {
    connect(): Promise<DesktopDeviceStatus>;
    disconnect(): Promise<DesktopDeviceStatus>;
    getStatus(): Promise<DesktopDeviceStatus>;
    subscribe(listener: (event: DeviceEvent) => void): () => void;
  };
}
