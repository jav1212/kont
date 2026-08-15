import assert from "node:assert/strict";
import test from "node:test";
import { PortalAvailability, summarizePlatformStatus, type PortalStatus } from "../src/index.js";

function portal(id: string, status: PortalAvailability, checkedAt: string | null = null): PortalStatus {
  return { id, slug: id, name: id, category: "fiscal", logoUrl: null, status, responseTimeMs: null, checkedAt };
}

test("uses the worst known portal state for the platform indicator", () => {
  assert.equal(summarizePlatformStatus([portal("a", PortalAvailability.Operational), portal("b", PortalAvailability.Degraded)]).status, PortalAvailability.Degraded);
  assert.equal(summarizePlatformStatus([portal("a", PortalAvailability.Degraded), portal("b", PortalAvailability.Down)]).status, PortalAvailability.Down);
});

test("does not report operational while an active portal has no evidence", () => {
  const snapshot = summarizePlatformStatus([
    portal("a", PortalAvailability.Operational),
    portal("b", PortalAvailability.Unknown),
  ]);
  assert.equal(snapshot.status, PortalAvailability.Unknown);
  assert.deepEqual(snapshot.summary, { operational: 1, degraded: 0, down: 0, unknown: 1, total: 2 });
});

test("reports the newest observation without inventing one for an empty portfolio", () => {
  assert.equal(summarizePlatformStatus([]).observedAt, null);
  assert.equal(summarizePlatformStatus([
    portal("a", PortalAvailability.Operational, "2026-08-15T10:00:00.000Z"),
    portal("b", PortalAvailability.Operational, "2026-08-15T11:00:00.000Z"),
  ]).observedAt, "2026-08-15T11:00:00.000Z");
});
