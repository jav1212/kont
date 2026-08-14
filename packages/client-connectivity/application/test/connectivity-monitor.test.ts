import assert from "node:assert/strict";
import test from "node:test";
import type { ConnectivityProbeResult } from "@kontave/client-connectivity-contracts";
import {
  ClientConnectivityFailure,
  ConnectivityMonitor,
  type ConnectivityProbe,
} from "../src/index.js";

const NOW = "2026-08-14T16:00:00.000Z";
const clock = { now: () => NOW };

class MutableProbe implements ConnectivityProbe {
  calls = 0;
  constructor(public result: ConnectivityProbeResult) {}
  async check(): Promise<ConnectivityProbeResult> {
    this.calls += 1;
    return this.result;
  }
}

test("starts unknown and publishes successful backend evidence", async () => {
  const probe = new MutableProbe({ reachable: true });
  const monitor = new ConnectivityMonitor({ probe, clock });
  const initial = monitor.getSnapshot();
  assert.equal(initial.availability, "unknown");
  assert.equal(monitor.getSnapshot(), initial);

  const notifications: boolean[] = [];
  monitor.subscribe(() => notifications.push(monitor.getSnapshot().checking));
  const snapshot = await monitor.refresh();
  assert.deepEqual(notifications, [true, false]);
  assert.deepEqual(snapshot, {
    availability: "available",
    checking: false,
    reason: null,
    observedAt: NOW,
    consecutiveFailures: 0,
  });
});

test("uses degraded hysteresis before declaring an established connection unavailable", async () => {
  const probe = new MutableProbe({ reachable: true });
  const monitor = new ConnectivityMonitor({ probe, clock, failureThreshold: 3 });
  await monitor.refresh();
  probe.result = { reachable: false, reason: "probe_timeout" };

  assert.equal((await monitor.refresh()).availability, "degraded");
  assert.equal((await monitor.refresh()).availability, "degraded");
  const unavailable = await monitor.refresh();
  assert.equal(unavailable.availability, "unavailable");
  assert.equal(unavailable.consecutiveFailures, 3);

  probe.result = { reachable: true };
  const recovered = await monitor.refresh();
  assert.equal(recovered.availability, "available");
  assert.equal(recovered.consecutiveFailures, 0);
  assert.equal(recovered.reason, null);
});

test("does not claim degradation before it has positive evidence", async () => {
  const probe = new MutableProbe({ reachable: false, reason: "network_unreachable" });
  const monitor = new ConnectivityMonitor({ probe, clock, failureThreshold: 2 });
  assert.equal((await monitor.refresh()).availability, "unknown");
  assert.equal((await monitor.refresh()).availability, "unavailable");
});

test("coalesces concurrent refresh requests into one probe", async () => {
  let resolveProbe: ((result: ConnectivityProbeResult) => void) | undefined;
  const probe: ConnectivityProbe = {
    check: () => new Promise((resolve) => { resolveProbe = resolve; }),
  };
  const monitor = new ConnectivityMonitor({ probe, clock });
  const first = monitor.refresh();
  const second = monitor.refresh();
  resolveProbe?.({ reachable: true });
  assert.equal((await first).availability, "available");
  assert.equal(await second, await first);
});

test("unexpected probe failures are observed and counted as unavailable evidence", async () => {
  const failure = new Error("adapter crashed");
  const observed: unknown[] = [];
  const monitor = new ConnectivityMonitor({
    probe: { check: async () => { throw failure; } },
    clock,
    failureThreshold: 1,
    unexpectedFailureObserver: { record: (cause) => { observed.push(cause); } },
  });
  const snapshot = await monitor.refresh();
  assert.deepEqual(observed, [failure]);
  assert.equal(snapshot.availability, "unavailable");
  assert.equal(snapshot.reason, "service_unreachable");
});

test("rejects invalid stabilization configuration", () => {
  assert.throws(
    () => new ConnectivityMonitor({ probe: new MutableProbe({ reachable: true }), failureThreshold: 0 }),
    (failure) => failure instanceof ClientConnectivityFailure && failure.code === "CONNECTIVITY_INVALID_CONFIGURATION",
  );
});
