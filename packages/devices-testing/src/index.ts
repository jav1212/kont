import type { DeviceCapability, DeviceDescriptor, DeviceEvent, DeviceFailure } from "@kontave/device-contracts";
import type { DeviceAdapter, DeviceCandidate, DeviceEventSink, DeviceLogger, DeviceSession } from "@kontave/devices-core";

/** Test-only adapter used to verify orchestration without physical hardware. */
export class FakeScannerAdapter implements DeviceAdapter {
  readonly id = "fake-barcode-scanner";
  readonly capabilities = ["barcode.scan"] as const satisfies readonly DeviceCapability[];
  private available = true;
  disconnectCount = 0;

  readonly device: DeviceDescriptor = {
    id: "fake-scanner-1",
    category: "barcode-scanner",
    manufacturer: "Kontave",
    model: "Test Scanner",
    connection: "serial",
    capabilities: this.capabilities,
  };

  setAvailable(available: boolean): void {
    this.available = available;
  }

  async discover(signal: AbortSignal): Promise<readonly DeviceCandidate[]> {
    signal.throwIfAborted();
    return this.available ? [{ descriptor: this.device, adapterId: this.id }] : [];
  }

  async connect(candidate: DeviceCandidate, signal: AbortSignal): Promise<DeviceSession> {
    signal.throwIfAborted();
    return {
      device: candidate.descriptor,
      disconnect: async () => {
        this.disconnectCount += 1;
      },
    };
  }
}

export class RecordingEventSink implements DeviceEventSink {
  readonly events: DeviceEvent[] = [];
  publish(event: DeviceEvent): void {
    this.events.push(event);
  }
}

export class RecordingDeviceLogger implements DeviceLogger {
  readonly information: Array<{ readonly code: string; readonly context?: Readonly<Record<string, unknown>> }> = [];
  readonly failures: DeviceFailure[] = [];

  info(code: string, context?: Readonly<Record<string, unknown>>): void {
    this.information.push(context === undefined ? { code } : { code, context });
  }

  error(failure: DeviceFailure): void {
    this.failures.push(failure);
  }
}
