import assert from "node:assert/strict";
import test from "node:test";
import { DeviceGateway } from "../src/gateway/device-gateway";
import { PROTOCOL_VERSION, type ManagerEvent } from "../src/protocol/contracts";

interface FakeSocket { readyState: number; sent: ManagerEvent[]; closed?: { code: number; reason: string }; send(value: string): void; close(code: number, reason: string): void }

function socket(): FakeSocket {
  return {
    readyState: 1,
    sent: [],
    send(value) { this.sent.push(JSON.parse(value) as ManagerEvent); },
    close(code, reason) { this.closed = { code, reason }; },
  };
}

function gateway(): DeviceGateway {
  return new DeviceGateway({ websocketPort: 47831, allowedOrigins: [], baudRate: 9600, installId: "test" }, "test", async () => false);
}

interface GatewayInternals {
  authenticated: WeakSet<FakeSocket>;
  onMessage(socket: FakeSocket, origin: string, raw: string): Promise<void>;
  broadcast(event: ManagerEvent): void;
  releaseAccessCapture(socket: FakeSocket, leaseId?: string): void;
  accessCapture: { socket: FakeSocket; leaseId: string; expiresAt: number } | null;
  sockets: { clients: Set<FakeSocket> } | null;
}

function internals(subject: DeviceGateway): GatewayInternals { return subject as unknown as GatewayInternals; }

const productScan: ManagerEvent = { type: "barcode.scanned", eventId: "product", barcode: "123456", occurredAt: "2026-01-01T00:00:00.000Z", device: { id: "scanner", category: "barcode-scanner", manufacturer: "Test", model: "Test", connection: "USB" } };
const badgeScan: ManagerEvent = { ...productScan, eventId: "badge", barcode: "KONT-credential" };

test("entrega una credencial únicamente al socket que posee la captura exclusiva", async () => {
  const subject = internals(gateway()); const owner = socket(); const other = socket();
  subject.authenticated.add(owner); subject.authenticated.add(other);
  await subject.onMessage(owner, "https://kontave.com", JSON.stringify({ type: "barcode.access-capture.request", protocolVersion: PROTOCOL_VERSION }));
  assert.equal(subject.accessCapture?.socket, owner);
  await subject.onMessage(other, "https://kontave.com", JSON.stringify({ type: "barcode.access-capture.request", protocolVersion: PROTOCOL_VERSION }));
  subject.broadcast(badgeScan);
  assert.equal(owner.sent.filter((event) => event.type === "barcode.access-capture.scanned").length, 1);
  assert.equal(other.sent.filter((event) => event.type === "barcode.access-capture.scanned" || event.type === "barcode.scanned").length, 0);
  assert.deepEqual(other.sent.at(-1), { type: "barcode.access-capture.denied", reason: "CAPTURE_IN_USE" });
});

test("una credencial no se entrega tras vencer o desconectar el propietario", async () => {
  const subject = internals(gateway()); const owner = socket(); const next = socket();
  subject.authenticated.add(owner); subject.authenticated.add(next);
  await subject.onMessage(owner, "https://kontave.com", JSON.stringify({ type: "barcode.access-capture.request", protocolVersion: PROTOCOL_VERSION }));
  const expiredLease = subject.accessCapture!; expiredLease.expiresAt = Date.now() - 1;
  subject.broadcast(badgeScan);
  assert.equal(owner.sent.filter((event) => event.type === "barcode.access-capture.scanned").length, 0);
  await subject.onMessage(next, "https://kontave.com", JSON.stringify({ type: "barcode.access-capture.request", protocolVersion: PROTOCOL_VERSION }));
  subject.releaseAccessCapture(next);
  subject.broadcast(badgeScan);
  assert.equal(next.sent.filter((event) => event.type === "barcode.access-capture.scanned").length, 0);
});

test("sigue difundiendo códigos de producto a todos los clientes emparejados", () => {
  const subject = internals(gateway()); const first = socket(); const second = socket();
  subject.authenticated.add(first); subject.authenticated.add(second);
  subject.sockets = { clients: new Set([first, second]) };
  subject.broadcast(productScan);
  assert.deepEqual(first.sent, [productScan]);
  assert.deepEqual(second.sent, [productScan]);
});
