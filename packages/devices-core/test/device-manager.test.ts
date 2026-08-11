import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DeviceDescriptor, DeviceEvent, DeviceFailure } from "@kontave/device-contracts";
import { DeviceManager, type DeviceAdapter, type DeviceCandidate, type DeviceEventSink, type DeviceLogger, type DeviceSession } from "../src/index.js";

class TestScannerAdapter implements DeviceAdapter {
  readonly id = "test-scanner";
  readonly capabilities = ["barcode.scan"] as const;
  readonly device: DeviceDescriptor = {
    id: "scanner-1",
    category: "barcode-scanner",
    manufacturer: "Kontave",
    model: "Test Scanner",
    connection: "serial",
    capabilities: this.capabilities,
  };
  available = true;
  disconnectCount = 0;

  async discover(_signal: AbortSignal): Promise<readonly DeviceCandidate[]> {
    return this.available ? [{ descriptor: this.device, adapterId: this.id }] : [];
  }

  async connect(candidate: DeviceCandidate, _signal: AbortSignal): Promise<DeviceSession> {
    return {
      device: candidate.descriptor,
      disconnect: async () => { this.disconnectCount += 1; },
    };
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
});
