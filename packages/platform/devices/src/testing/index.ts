import type { DeviceCapability, DeviceDescriptor, DeviceEvent, DeviceFailure, DeviceSessionEvent } from "@kontave/devices/contracts";
import type { DeviceAdapter, DeviceCandidate, DeviceEventSink, DeviceLogger, DeviceSession } from "@kontave/devices/core";

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

  /**
   * Controls whether discovery returns the fake scanner.
   * @param available - Whether the fake device should be discoverable.
   * @returns Nothing.
   */
  setAvailable(available: boolean): void {
    this.available = available;
  }

  /** {@inheritDoc DeviceAdapter.discover} */
  async discover(signal: AbortSignal): Promise<readonly DeviceCandidate[]> {
    signal.throwIfAborted();
    return this.available ? [{ descriptor: this.device, adapterId: this.id }] : [];
  }

  /** {@inheritDoc DeviceAdapter.connect} */
  async connect(candidate: DeviceCandidate, signal: AbortSignal): Promise<DeviceSession> {
    signal.throwIfAborted();
    return {
      device: candidate.descriptor,
      subscribe: (_listener: (event: DeviceSessionEvent) => void) => () => undefined,
      disconnect: async () => {
        this.disconnectCount += 1;
      },
    };
  }
}

/** In-memory event sink retaining device events for test assertions. */
export class RecordingEventSink implements DeviceEventSink {
  readonly events: DeviceEvent[] = [];
  /** {@inheritDoc DeviceEventSink.publish} */
  publish(event: DeviceEvent): void {
    this.events.push(event);
  }
}

/** In-memory structured logger retaining device diagnostics for tests. */
export class RecordingDeviceLogger implements DeviceLogger {
  readonly information: Array<{ readonly code: string; readonly context?: Readonly<Record<string, unknown>> }> = [];
  readonly failures: DeviceFailure[] = [];

  /** {@inheritDoc DeviceLogger.info} */
  info(code: string, context?: Readonly<Record<string, unknown>>): void {
    this.information.push(context === undefined ? { code } : { code, context });
  }

  /** {@inheritDoc DeviceLogger.error} */
  error(failure: DeviceFailure): void {
    this.failures.push(failure);
  }
}
