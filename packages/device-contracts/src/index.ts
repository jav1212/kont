export const DEVICE_PROTOCOL_VERSION = 1 as const;

export type DeviceCapability =
  | "barcode.scan"
  | "receipt.print"
  | "weight.read"
  | "fiscal.document.issue";

export type DeviceCategory =
  | "barcode-scanner"
  | "receipt-printer"
  | "scale"
  | "fiscal-printer";

export type DeviceConnectionKind =
  | "serial"
  | "hid"
  | "bluetooth"
  | "camera"
  | "network";

export interface DeviceDescriptor {
  readonly id: string;
  readonly category: DeviceCategory;
  readonly manufacturer: string;
  readonly model: string;
  readonly connection: DeviceConnectionKind;
  readonly capabilities: readonly DeviceCapability[];
}

export type DeviceLifecycleState =
  | "idle"
  | "discovering"
  | "connecting"
  | "ready"
  | "reconnecting"
  | "requires-action"
  | "stopped";

export interface DeviceFailure {
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
  readonly cause?: unknown;
}

export type DeviceEvent =
  | { readonly type: "device.state-changed"; readonly state: DeviceLifecycleState }
  | { readonly type: "device.connected"; readonly device: DeviceDescriptor }
  | { readonly type: "device.disconnected"; readonly deviceId: string }
  | { readonly type: "barcode.scanned"; readonly eventId: string; readonly deviceId: string; readonly value: string; readonly occurredAt: string }
  | { readonly type: "device.failed"; readonly failure: DeviceFailure };

export interface DeviceHandshake {
  readonly protocolVersion: typeof DEVICE_PROTOCOL_VERSION;
  readonly client: {
    readonly kind: "web" | "desktop" | "mobile";
    readonly version: string;
  };
  readonly requestedCapabilities: readonly DeviceCapability[];
}
