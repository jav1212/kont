export const PROTOCOL_VERSION = 1;
/** Capability name advertised by Bridges that can isolate credential barcode scans. */
export const ACCESS_CAPTURE_CAPABILITY = "barcode.access-capture.v1";

export type DeviceCategory = "barcode-scanner" | "fiscal-printer" | "scale" | "receipt-printer" | "payment-terminal";
export type DeviceStatus = "disconnected" | "detecting" | "connecting" | "connected" | "reconnecting" | "error";

export interface DeviceInfo {
  id: string;
  category: DeviceCategory;
  manufacturer: string;
  model: string;
  connection: string;
}

export type ManagerEvent =
  | { type: "manager.hello"; protocolVersion: number; managerVersion: string; paired: boolean; capabilities: readonly string[] }
  | { type: "device.status"; device: DeviceInfo | null; status: DeviceStatus; message?: string }
  | { type: "barcode.scanned"; eventId: string; device: DeviceInfo; barcode: string; symbology?: string; occurredAt: string }
  | { type: "barcode.access-capture.granted"; leaseId: string; expiresAt: string }
  | { type: "barcode.access-capture.denied"; reason: "CAPTURE_IN_USE" }
  | { type: "barcode.access-capture.scanned"; eventId: string; device: DeviceInfo; barcode: string; symbology?: string; occurredAt: string; leaseId: string }
  | { type: "pairing.result"; approved: boolean; token?: string; message?: string }
  | { type: "manager.error"; code: string; message: string; eventId?: string; occurredAt?: string; managerVersion?: string; installId?: string };

export type ClientMessage =
  | { type: "client.hello"; protocolVersion: number }
  | { type: "pairing.request"; clientName: string; protocolVersion: number }
  | { type: "barcode.access-capture.request"; protocolVersion: number }
  | { type: "barcode.access-capture.heartbeat"; protocolVersion: number; leaseId: string }
  | { type: "barcode.access-capture.release"; protocolVersion: number; leaseId: string };

/**
 * Validates an untrusted message received from a paired Web client.
 *
 * @param value - Decoded JSON received through the local WebSocket.
 * @returns The validated protocol message, or `null` when it is malformed.
 */
export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (item.type === "client.hello" && typeof item.protocolVersion === "number") return item as ClientMessage;
  if (item.type === "pairing.request" && typeof item.clientName === "string" && item.clientName.length > 0 && item.clientName.length <= 100 && typeof item.protocolVersion === "number") return item as ClientMessage;
  if (item.type === "barcode.access-capture.request" && typeof item.protocolVersion === "number") return item as ClientMessage;
  if ((item.type === "barcode.access-capture.heartbeat" || item.type === "barcode.access-capture.release") && typeof item.protocolVersion === "number" && isLeaseId(item.leaseId)) return item as ClientMessage;
  return null;
}

function isLeaseId(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value); }
