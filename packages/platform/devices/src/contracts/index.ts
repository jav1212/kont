/** Current portable protocol version shared by device clients and bridges. */
export const DEVICE_PROTOCOL_VERSION = 1 as const;

/** Business capability a physical device may provide. */
export type DeviceCapability =
  | "barcode.scan"
  | "receipt.print"
  | "weight.read"
  | "fiscal.document.issue";

/** Portable category used to classify a physical device. */
export type DeviceCategory =
  | "barcode-scanner"
  | "receipt-printer"
  | "scale"
  | "fiscal-printer";

/** Transport used to communicate with a physical device. */
export type DeviceConnectionKind =
  | "serial"
  | "hid"
  | "bluetooth"
  | "camera"
  | "network";

/** Immutable portable description of a discovered device. */
export interface DeviceDescriptor {
  readonly id: string;
  readonly category: DeviceCategory;
  readonly manufacturer: string;
  readonly model: string;
  readonly connection: DeviceConnectionKind;
  readonly connectionAddress?: string;
  readonly capabilities: readonly DeviceCapability[];
}

/** Lifecycle state of device discovery and connection orchestration. */
export type DeviceLifecycleState =
  | "idle"
  | "discovering"
  | "connecting"
  | "ready"
  | "reconnecting"
  | "requires-action"
  | "stopped";

/** Typed device failure safe to transport across application boundaries. */
export interface DeviceFailure {
  readonly code: DeviceFailureCode;
  readonly message: string;
  readonly recoverable: boolean;
  readonly cause?: unknown;
}

/** Stable classifications for expected device failures. */
export type DeviceFailureCode =
  | "DEVICE_CAPABILITY_UNSUPPORTED"
  | "DEVICE_NOT_FOUND"
  | "DEVICE_CONNECTION_FAILED"
  | "DEVICE_CONNECTION_LOST"
  | "DEVICE_PERMISSION_DENIED"
  | "DEVICE_OPERATION_CANCELLED"
  | "DEVICE_PROTOCOL_INCOMPATIBLE"
  | "DEVICE_UNEXPECTED_ERROR";

/** Portable event emitted by device orchestration and active sessions. */
export type DeviceEvent =
  | { readonly type: "device.state-changed"; readonly state: DeviceLifecycleState }
  | { readonly type: "device.connected"; readonly device: DeviceDescriptor }
  | { readonly type: "device.disconnected"; readonly deviceId: string }
  | { readonly type: "barcode.scanned"; readonly eventId: string; readonly deviceId: string; readonly value: string; readonly occurredAt: string }
  | { readonly type: "device.failed"; readonly failure: DeviceFailure };

/** Event emitted specifically by an active device session. */
export type DeviceSessionEvent = Extract<
  DeviceEvent,
  { readonly type: "barcode.scanned" | "device.disconnected" | "device.failed" }
>;

/** Initial protocol negotiation sent by a device client. */
export interface DeviceHandshake {
  readonly protocolVersion: typeof DEVICE_PROTOCOL_VERSION;
  readonly client: {
    readonly kind: "web" | "desktop" | "mobile";
    readonly version: string;
  };
  readonly requestedCapabilities: readonly DeviceCapability[];
}

/** Commands accepted by the portable device protocol. */
export type DeviceCommand =
  | { readonly type: "device.connect"; readonly capability: DeviceCapability }
  | { readonly type: "device.disconnect" }
  | { readonly type: "device.status" };

/** Correlated command request sent through the device protocol. */
export interface DeviceProtocolRequest {
  readonly protocolVersion: typeof DEVICE_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly command: DeviceCommand;
}

/** Correlated success or failure response returned by the device protocol. */
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

/**
 * Determines whether a value identifies the current device protocol.
 * @param value - Untrusted protocol version to inspect.
 * @returns `true` only for the supported protocol version.
 */
export function isCompatibleProtocolVersion(value: unknown): value is typeof DEVICE_PROTOCOL_VERSION {
  return value === DEVICE_PROTOCOL_VERSION;
}
