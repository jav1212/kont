import assert from "node:assert/strict";
import test from "node:test";
import type { Incident } from "@kontave/observability-application";
import { FailingIncidentRecorder, RecordingIncidentRecorder } from "../src/index.js";

const incident = { code: "KNT-20260813-ABCDEF12" } as Incident;

test("records incidents for consumer tests", async () => {
  const recorder = new RecordingIncidentRecorder();
  await recorder.record(incident);
  assert.equal(recorder.incidents[0], incident);
});

test("simulates unavailable incident storage", async () => {
  await assert.rejects(() => new FailingIncidentRecorder().record(incident), /unavailable/);
});
