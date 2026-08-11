import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DeviceDescriptor, DeviceEvent, DeviceFailure, DeviceSessionEvent } from "@kontave/device-contracts";
import { DeviceManager, ExponentialBackoffPolicy, type DeviceAdapter, type DeviceCandidate, type DeviceEventSink, type DeviceLogger, type DeviceSession, type Sleeper } from "../src/index.js";

class TestScannerAdapter implements DeviceAdapter {
  readonly id: string;
  readonly capabilities = ["barcode.scan"] as const;
  readonly device: DeviceDescriptor;
  available = true;
  availableAfterDiscoveries = 0;
  discoveryCount = 0;
  disconnectCount = 0;

  constructor(id = "test-scanner", deviceId = "scanner-1") {
    this.id = id;
    this.device = {
      id: deviceId,
      category: "barcode-scanner",
      manufacturer: "Kontave",
      model: "Test Scanner",
      connection: "serial",
      capabilities: this.capabilities,
    };
  }

  async discover(_signal: AbortSignal): Promise<readonly DeviceCandidate[]> {
    this.discoveryCount += 1;
    const ready = this.available && this.discoveryCount > this.availableAfterDiscoveries;
    return ready ? [{ descriptor: this.device, adapterId: this.id }] : [];
  }

  async connect(candidate: DeviceCandidate, _signal: AbortSignal): Promise<DeviceSession> {
    return {
      device: candidate.descriptor,
      subscribe: (_listener: (event: DeviceSessionEvent) => void) => () => undefined,
      disconnect: async () => { this.disconnectCount += 1; },
    };
  }
}

class ImmediateSleeper implements Sleeper {
  readonly delays: number[] = [];
  async sleep(delayMs: number, _signal: AbortSignal): Promise<void> {
    this.delays.push(delayMs);
  }
}

class TestEventSink implements DeviceEventSink {
  readonly events: DeviceEvent[] = [];
  publish(event: DeviceEvent): void { this.events.push(event); }
}

class TestLogger implements DeviceLogger {
  readonly information: string[] = [];
  readonly failures: DeviceFailure[] = [];
  info(code: string): void { this.information.push(code); }
  error(failure: DeviceFailure): void { this.failures.push(failure); }
}

describe("DeviceManager", () => {
  it("connects by capability and publishes the lifecycle", async () => {
    const adapter = new TestScannerAdapter();
    const events = new TestEventSink();
    const logger = new TestLogger();
    const manager = new DeviceManager({ adapters: [adapter], events, logger });

    const device = await manager.connectFirst("barcode.scan");

    assert.equal(device.id, adapter.device.id);
    assert.equal(manager.state, "ready");
    assert.deepEqual(events.events.map((event) => event.type), [
      "device.state-changed",
      "device.state-changed",
      "device.state-changed",
      "device.connected",
    ]);
    assert.equal(logger.information[0], "DEVICE_CONNECTED");
  });

  it("requests reconnection when no physical device is found", async () => {
    const adapter = new TestScannerAdapter();
    adapter.available = false;
    const logger = new TestLogger();
    const manager = new DeviceManager({ adapters: [adapter], events: new TestEventSink(), logger });

    await assert.rejects(manager.connectFirst("barcode.scan"), (failure: unknown) =>
      typeof failure === "object" && failure !== null && "code" in failure && failure.code === "DEVICE_NOT_FOUND",
    );

    assert.equal(manager.state, "reconnecting");
    assert.equal(logger.failures[0]?.recoverable, true);
  });

  it("disconnects the active session when stopped", async () => {
    const adapter = new TestScannerAdapter();
    const events = new TestEventSink();
    const manager = new DeviceManager({ adapters: [adapter], events, logger: new TestLogger() });

    await manager.connectFirst("barcode.scan");
    await manager.stop();

    assert.equal(manager.state, "stopped");
    assert.equal(adapter.disconnectCount, 1);
    assert.equal(events.events.at(-1)?.type, "device.disconnected");
  });

  it("selects an explicitly preferred device across compatible adapters", async () => {
    const first = new TestScannerAdapter("first-adapter", "scanner-a");
    const preferred = new TestScannerAdapter("preferred-adapter", "scanner-b");
    const manager = new DeviceManager({
      adapters: [first, preferred],
      events: new TestEventSink(),
      logger: new TestLogger(),
    });

    const device = await manager.connectFirst("barcode.scan", {
      preferredDeviceId: "scanner-b",
    });

    assert.equal(device.id, "scanner-b");
  });

  it("retries recoverable discovery failures using the configured backoff", async () => {
    const adapter = new TestScannerAdapter();
    adapter.availableAfterDiscoveries = 2;
    const sleeper = new ImmediateSleeper();
    const manager = new DeviceManager({
      adapters: [adapter],
      events: new TestEventSink(),
      logger: new TestLogger(),
      sleeper,
    });

    const device = await manager.connectFirst("barcode.scan", {
      reconnection: new ExponentialBackoffPolicy(3, 100, 1_000),
    });

    assert.equal(device.id, adapter.device.id);
    assert.equal(adapter.discoveryCount, 3);
    assert.deepEqual(sleeper.delays, [100, 200]);
    assert.equal(manager.state, "ready");
  });
});
