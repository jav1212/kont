import type {
  DeviceDescriptor,
  DeviceEvent,
  DeviceLifecycleState,
} from "@kontave/device-contracts";
/** Current lifecycle and optional identity of the attached device. */
export interface DesktopDeviceStatus {
  readonly state: DeviceLifecycleState;
  readonly device?: DeviceDescriptor;
}
/** Local-device capability exposed by preload. */
export interface DesktopDevicesApi {
  connect(): Promise<DesktopDeviceStatus>;
  disconnect(): Promise<DesktopDeviceStatus>;
  getStatus(): Promise<DesktopDeviceStatus>;
  subscribe(listener: (event: DeviceEvent) => void): () => void;
}
