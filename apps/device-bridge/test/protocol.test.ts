import assert from "node:assert/strict";
import test from "node:test";
import { parseClientMessage, PROTOCOL_VERSION } from "../src/protocol/contracts";
test("acepta solicitudes de emparejamiento válidas", () => assert.deepEqual(parseClientMessage({ type: "pairing.request", clientName: "Kontave Web", protocolVersion: PROTOCOL_VERSION }), { type: "pairing.request", clientName: "Kontave Web", protocolVersion: 1 }));
test("rechaza mensajes desconocidos", () => assert.equal(parseClientMessage({ type: "admin.execute" }), null));
test("acepta renovación de la captura exclusiva y rechaza un lease inválido", () => {
  const leaseId = "5ee00b89-07f1-4b59-8c6e-4ba1b1ec20a2";
  assert.deepEqual(parseClientMessage({ type: "barcode.access-capture.heartbeat", protocolVersion: PROTOCOL_VERSION, leaseId }), { type: "barcode.access-capture.heartbeat", protocolVersion: 1, leaseId });
  assert.equal(parseClientMessage({ type: "barcode.access-capture.release", protocolVersion: PROTOCOL_VERSION, leaseId: "not-a-lease" }), null);
});
