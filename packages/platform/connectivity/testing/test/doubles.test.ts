import assert from "node:assert/strict";
import test from "node:test";
import { ConnectivityMonitor } from "@kontave/client-connectivity-application";
import { FixedConnectivityClock, QueueConnectivityProbe } from "../src/index";

test("connectivity test doubles produce deterministic observations", async () => {
  const probe = new QueueConnectivityProbe();
  const clock = new FixedConnectivityClock("2026-08-14T18:30:00.000Z");
  probe.enqueue({ reachable: true });
  const snapshot = await new ConnectivityMonitor({ probe, clock }).refresh();
  assert.equal(probe.calls, 1);
  assert.equal(snapshot.availability, "available");
  assert.equal(snapshot.observedAt, "2026-08-14T18:30:00.000Z");
});
