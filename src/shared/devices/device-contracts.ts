export const DEVICE_PROTOCOL_VERSION = 1;
/** Advertises support for exclusive delivery of credential barcode scans. */
export const ACCESS_CAPTURE_CAPABILITY = "barcode.access-capture.v1";
export type DeviceCategory = "barcode-scanner" | "fiscal-printer" | "scale" | "receipt-printer" | "payment-terminal";
export type DeviceStatus = "disconnected" | "detecting" | "connecting" | "connected" | "reconnecting" | "error";
export interface DeviceInfo { id: string; category: DeviceCategory; manufacturer: string; model: string; connection: string }
export interface BarcodeScannedEvent { type: "barcode.scanned"; eventId: string; device: DeviceInfo; barcode: string; symbology?: string; occurredAt: string }
/** A credential scan delivered solely to the WebSocket that owns the active capture lease. */
export interface AccessCaptureScannedEvent { type: "barcode.access-capture.scanned"; eventId: string; device: DeviceInfo; barcode: string; symbology?: string; occurredAt: string; leaseId: string }
export type DeviceManagerEvent =
    | { type: "manager.hello"; protocolVersion: number; managerVersion: string; paired: boolean; capabilities?: readonly string[] }
    | { type: "device.status"; device: DeviceInfo | null; status: DeviceStatus; message?: string }
    | BarcodeScannedEvent
    | { type: "barcode.access-capture.granted"; leaseId: string; expiresAt: string }
    | { type: "barcode.access-capture.denied"; reason: "CAPTURE_IN_USE" }
    | AccessCaptureScannedEvent
    | { type: "pairing.result"; approved: boolean; token?: string; message?: string }
    | { type: "manager.error"; code: string; message: string; eventId?: string; occurredAt?: string; managerVersion?: string; installId?: string };

/**
 * Validates an untrusted event received from the local Device Bridge.
 *
 * @param value - Decoded JSON received through the Bridge WebSocket.
 * @returns The validated event, or `null` if it does not match the protocol.
 */
export function parseDeviceManagerEvent(value: unknown): DeviceManagerEvent | null {
    if (!value || typeof value !== "object") return null;
    const event = value as Record<string, unknown>;
    if (event.type === "manager.hello" && typeof event.protocolVersion === "number" && typeof event.managerVersion === "string" && typeof event.paired === "boolean" && (event.capabilities === undefined || (Array.isArray(event.capabilities) && event.capabilities.every((capability) => typeof capability === "string")))) return event as unknown as DeviceManagerEvent;
    if (event.type === "device.status" && typeof event.status === "string" && ["disconnected", "detecting", "connecting", "connected", "reconnecting", "error"].includes(event.status)) return event as unknown as DeviceManagerEvent;
    if (event.type === "barcode.scanned" && typeof event.eventId === "string" && typeof event.barcode === "string" && event.barcode.length > 0 && event.barcode.length <= 128 && typeof event.occurredAt === "string" && typeof event.device === "object") return event as unknown as DeviceManagerEvent;
    if (event.type === "barcode.access-capture.granted" && isLeaseId(event.leaseId) && typeof event.expiresAt === "string") return event as unknown as DeviceManagerEvent;
    if (event.type === "barcode.access-capture.denied" && event.reason === "CAPTURE_IN_USE") return event as unknown as DeviceManagerEvent;
    if (event.type === "barcode.access-capture.scanned" && typeof event.eventId === "string" && typeof event.barcode === "string" && event.barcode.length > 0 && event.barcode.length <= 128 && typeof event.occurredAt === "string" && typeof event.device === "object" && isLeaseId(event.leaseId)) return event as unknown as DeviceManagerEvent;
    if (event.type === "pairing.result" && typeof event.approved === "boolean" && (event.token === undefined || typeof event.token === "string")) return event as unknown as DeviceManagerEvent;
    if (event.type === "manager.error" && typeof event.code === "string" && typeof event.message === "string") return event as unknown as DeviceManagerEvent;
    return null;
}

function isLeaseId(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value); }
