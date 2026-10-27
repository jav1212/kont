import assert from "node:assert/strict";
import test from "node:test";
import { deviceManagerIncidentSignature, isDeviceManagerIncident } from "../src/shared/frontend/devices/device-incident-policy";

test("reader availability states are not incidents", () => {
    // The two messages that produced 193 incidents in 30 days.
    assert.equal(isDeviceManagerIncident({ code: "DEVICE_MANAGER_ERROR", message: "No se pudo conectar: No se encontró un lector compatible. Configura el lector en modo HID." }), false);
    assert.equal(isDeviceManagerIncident({ code: "DEVICE_MANAGER_ERROR", message: "No se pudo conectar: No se pudo conectar el lector: La base del lector no responde." }), false);
    assert.equal(isDeviceManagerIncident({ code: "PROTOCOL_MISMATCH", message: "Actualiza Kontave o Kontave Device Manager." }), false);
});

test("other manager failures are still incidents", () => {
    assert.equal(isDeviceManagerIncident({ code: "DEVICE_MANAGER_ERROR", message: "Inicio fallido: EADDRINUSE 47831" }), true);
    assert.equal(isDeviceManagerIncident({ code: "DEVICE_MANAGER_ERROR", message: "No se pudo configurar TLS: certificate expired" }), true);
});

test("the signature ignores per-broadcast identifiers so re-broadcasts deduplicate", () => {
    const first = { code: "DEVICE_MANAGER_ERROR", message: "Inicio fallido: EADDRINUSE", eventId: "a", occurredAt: "2026-10-27T10:00:00Z" };
    const again = { ...first, eventId: "b", occurredAt: "2026-10-27T10:05:00Z" };
    assert.equal(deviceManagerIncidentSignature(first), deviceManagerIncidentSignature(again));
});
