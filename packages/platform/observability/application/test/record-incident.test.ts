import assert from "node:assert/strict";
import test from "node:test";
import { RecordIncident, UuidIncidentCodeGenerator, type Clock, type Incident, type IncidentRecorder } from "../src/index";

const NOW = new Date("2026-08-13T18:00:00.000Z");
const clock: Clock = { now: () => NOW };
const codes = new UuidIncidentCodeGenerator(() => "abcdef12-0000-4000-8000-000000000000");
const resource = { serviceName: "device-bridge", serviceVersion: "0.1.0", environment: "test", platform: "windows" };

class RecordingRecorder implements IncidentRecorder {
  readonly incidents: Incident[] = [];
  async record(incident: Incident): Promise<void> { this.incidents.push(incident); }
}

test("records a structured incident with separate public and technical messages", async () => {
  const recorder = new RecordingRecorder();
  const useCase = new RecordIncident(recorder, codes, clock);
  const receipt = await useCase.execute({
    eventName: "device.connection_failed",
    severity: "error",
    source: "network",
    error: new TypeError("socket refused"),
    publicMessage: "No se pudo conectar el dispositivo.",
    resource,
  });

  assert.deepEqual(receipt, { status: "recorded", code: "KNT-20260813-ABCDEF12" });
  assert.equal(recorder.incidents[0]?.publicMessage, "No se pudo conectar el dispositivo.");
  assert.equal(recorder.incidents[0]?.technicalMessage, "socket refused");
  assert.equal(recorder.incidents[0]?.errorType, "TypeError");
});

test("removes nested secrets, personal data and log injection controls", async () => {
  const recorder = new RecordingRecorder();
  const useCase = new RecordIncident(recorder, codes, clock);
  const circular: Record<string, unknown> = { safe: "line one\nline two" };
  circular.self = circular;

  await useCase.execute({
    eventName: "api.unexpected_failure",
    severity: "error",
    source: "api",
    error: "failure",
    resource,
    attributes: {
      authorization: "Bearer secret",
      nested: { apiKey: "secret", operation: "save" },
      cedula: "V-123",
      circular,
    },
  });

  assert.deepEqual(recorder.incidents[0]?.attributes, {
    nested: { operation: "save" },
    circular: { safe: "line one line two", self: "[Circular]" },
  });
});

test("returns a truthful receipt when storage is unavailable", async () => {
  const useCase = new RecordIncident({ record: async () => { throw new Error("offline"); } }, codes, clock);
  const receipt = await useCase.execute({
    eventName: "desktop.unexpected_failure",
    severity: "fatal",
    source: "unknown",
    error: "failure",
    resource,
  });
  assert.deepEqual(receipt, {
    status: "not-recorded",
    code: "KNT-20260813-ABCDEF12",
    reason: "storage-unavailable",
  });
});

test("rejects high-cardinality event names", async () => {
  const useCase = new RecordIncident(new RecordingRecorder(), codes, clock);
  await assert.rejects(() => useCase.execute({
    eventName: "Device failed for user 123",
    severity: "error",
    source: "unknown",
    error: "failure",
    resource,
  }), /stable lowercase identifier/);
});
