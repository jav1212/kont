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
  readonly connectionAddress?: string;
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
  readonly code: DeviceFailureCode;
  readonly message: string;
  readonly recoverable: boolean;
  readonly cause?: unknown;
}

export type DeviceFailureCode =
  | "DEVICE_CAPABILITY_UNSUPPORTED"
  | "DEVICE_NOT_FOUND"
  | "DEVICE_CONNECTION_FAILED"
  | "DEVICE_CONNECTION_LOST"
  | "DEVICE_PERMISSION_DENIED"
  | "DEVICE_OPERATION_CANCELLED"
  | "DEVICE_PROTOCOL_INCOMPATIBLE"
  | "DEVICE_UNEXPECTED_ERROR";

export type DeviceEvent =
  | { readonly type: "device.state-changed"; readonly state: DeviceLifecycleState }
  | { readonly type: "device.connected"; readonly device: DeviceDescriptor }
  | { readonly type: "device.disconnected"; readonly deviceId: string }
  | { readonly type: "barcode.scanned"; readonly eventId: string; readonly deviceId: string; readonly value: string; readonly occurredAt: string }
  | { readonly type: "device.failed"; readonly failure: DeviceFailure };

export type DeviceSessionEvent = Extract<
  DeviceEvent,
  { readonly type: "barcode.scanned" | "device.disconnected" | "device.failed" }
>;

export interface DeviceHandshake {
  readonly protocolVersion: typeof DEVICE_PROTOCOL_VERSION;
  readonly client: {
    readonly kind: "web" | "desktop" | "mobile";
    readonly version: string;
  };
  readonly requestedCapabilities: readonly DeviceCapability[];
}

export type DeviceCommand =
  | { readonly type: "device.connect"; readonly capability: DeviceCapability }
  | { readonly type: "device.disconnect" }
  | { readonly type: "device.status" };

export interface DeviceProtocolRequest {
  readonly protocolVersion: typeof DEVICE_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly command: DeviceCommand;
}

export type DeviceProtocolResponse =
  | {
      readonly protocolVersion: typeof DEVICE_PROTOCOL_VERSION;
      readonly requestId: string;
      readonly ok: true;
      readonly device?: DeviceDescriptor;
      readonly state: DeviceLifecycleState;
    }
  | {
      readonly protocolVersion: typeof DEVICE_PROTOCOL_VERSION;
      readonly requestId: string;
      readonly ok: false;
      readonly failure: DeviceFailure;
    };

export function isCompatibleProtocolVersion(value: unknown): value is typeof DEVICE_PROTOCOL_VERSION {
  return value === DEVICE_PROTOCOL_VERSION;
}
