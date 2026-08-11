export const DEVICE_PROTOCOL_VERSION = 1;
export type DeviceCategory = "barcode-scanner" | "fiscal-printer" | "scale" | "receipt-printer" | "payment-terminal";
export type DeviceStatus = "disconnected" | "detecting" | "connecting" | "connected" | "reconnecting" | "error";
export interface DeviceInfo { id: string; category: DeviceCategory; manufacturer: string; model: string; connection: string }
export interface BarcodeScannedEvent { type: "barcode.scanned"; eventId: string; device: DeviceInfo; barcode: string; symbology?: string; occurredAt: string }
export type DeviceManagerEvent =
    | { type: "manager.hello"; protocolVersion: number; managerVersion: string; paired: boolean }
    | { type: "device.status"; device: DeviceInfo | null; status: DeviceStatus; message?: string }
    | BarcodeScannedEvent
    | { type: "pairing.result"; approved: boolean; token?: string; message?: string }
    | { type: "manager.error"; code: string; message: string; eventId?: string; occurredAt?: string; managerVersion?: string; installId?: string };

export function parseDeviceManagerEvent(value: unknown): DeviceManagerEvent | null {
    if (!value || typeof value !== "object") return null;
    const event = value as Record<string, unknown>;
    if (event.type === "manager.hello" && typeof event.protocolVersion === "number" && typeof event.managerVersion === "string" && typeof event.paired === "boolean") return event as unknown as DeviceManagerEvent;
    if (event.type === "device.status" && typeof event.status === "string" && ["disconnected", "detecting", "connecting", "connected", "reconnecting", "error"].includes(event.status)) return event as unknown as DeviceManagerEvent;
    if (event.type === "barcode.scanned" && typeof event.eventId === "string" && typeof event.barcode === "string" && event.barcode.length > 0 && event.barcode.length <= 128 && typeof event.occurredAt === "string" && typeof event.device === "object") return event as unknown as DeviceManagerEvent;
    if (event.type === "pairing.result" && typeof event.approved === "boolean" && (event.token === undefined || typeof event.token === "string")) return event as unknown as DeviceManagerEvent;
    if (event.type === "manager.error" && typeof event.code === "string" && typeof event.message === "string") return event as unknown as DeviceManagerEvent;
    return null;
}
