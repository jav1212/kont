import assert from "node:assert/strict";
import test from "node:test";
import { isIncidentCode, isIncidentSeverity, isIncidentSource } from "../src/index.js";

test("validates stable incident transport values", () => {
  assert.equal(isIncidentCode("KNT-20260813-ABCDEF12"), true);
  assert.equal(isIncidentCode("arbitrary"), false);
  assert.equal(isIncidentSource("client"), true);
  assert.equal(isIncidentSource("attacker-controlled"), false);
  assert.equal(isIncidentSeverity("fatal"), true);
  assert.equal(isIncidentSeverity("critical"), false);
});
