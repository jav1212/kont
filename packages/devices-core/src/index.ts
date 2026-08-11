import type {
  DeviceCapability,
  DeviceDescriptor,
  DeviceEvent,
  DeviceFailure,
  DeviceLifecycleState,
} from "@kontave/device-contracts";

export interface DeviceCandidate {
  readonly descriptor: DeviceDescriptor;
  readonly adapterId: string;
}

export interface DeviceSession {
  readonly device: DeviceDescriptor;
  disconnect(): Promise<void>;
}

export interface DeviceAdapter {
  readonly id: string;
  readonly capabilities: readonly DeviceCapability[];
  discover(signal: AbortSignal): Promise<readonly DeviceCandidate[]>;
  connect(candidate: DeviceCandidate, signal: AbortSignal): Promise<DeviceSession>;
}

export interface DeviceEventSink {
  publish(event: DeviceEvent): void;
}

export interface DeviceLogger {
  info(code: string, context?: Readonly<Record<string, unknown>>): void;
  error(failure: DeviceFailure, context?: Readonly<Record<string, unknown>>): void;
}

export interface DeviceManagerDependencies {
  readonly adapters: readonly DeviceAdapter[];
  readonly events: DeviceEventSink;
  readonly logger: DeviceLogger;
}

/** Coordinates adapters while remaining independent of hardware and UI frameworks. */
export class DeviceManager {
  private stateValue: DeviceLifecycleState = "idle";
  private session: DeviceSession | undefined;
  private operation: AbortController | undefined;

  constructor(private readonly dependencies: DeviceManagerDependencies) {}

  get state(): DeviceLifecycleState {
    return this.stateValue;
  }

  get connectedDevice(): DeviceDescriptor | undefined {
    return this.session?.device;
  }

  async connectFirst(capability: DeviceCapability): Promise<DeviceDescriptor> {
    this.cancelCurrentOperation();
    const operation = new AbortController();
    this.operation = operation;
    this.transition("discovering");

    try {
      const adapter = this.dependencies.adapters.find((candidate) =>
        candidate.capabilities.includes(capability),
      );
      if (!adapter) {
        throw createFailure("DEVICE_CAPABILITY_UNSUPPORTED", `No adapter provides ${capability}.`, false);
      }

      const candidates = await adapter.discover(operation.signal);
      const candidate = candidates[0];
      if (!candidate) {
        throw createFailure("DEVICE_NOT_FOUND", `No device providing ${capability} was found.`, true);
      }

      this.transition("connecting");
      this.session = await adapter.connect(candidate, operation.signal);
      this.transition("ready");
      this.dependencies.events.publish({ type: "device.connected", device: this.session.device });
      this.dependencies.logger.info("DEVICE_CONNECTED", {
        adapterId: adapter.id,
        deviceId: this.session.device.id,
      });
      return this.session.device;
    } catch (cause: unknown) {
      const failure = normalizeFailure(cause);
      this.transition(failure.recoverable ? "reconnecting" : "requires-action");
      this.dependencies.events.publish({ type: "device.failed", failure });
      this.dependencies.logger.error(failure);
      throw failure;
    } finally {
      if (this.operation === operation) this.operation = undefined;
    }
  }

  async stop(): Promise<void> {
    this.cancelCurrentOperation();
    const currentSession = this.session;
    this.session = undefined;
    await currentSession?.disconnect();
    this.transition("stopped");
    if (currentSession) {
      this.dependencies.events.publish({ type: "device.disconnected", deviceId: currentSession.device.id });
    }
  }

  private transition(state: DeviceLifecycleState): void {
    if (this.stateValue === state) return;
    this.stateValue = state;
    this.dependencies.events.publish({ type: "device.state-changed", state });
  }

  private cancelCurrentOperation(): void {
    this.operation?.abort();
    this.operation = undefined;
  }
}

function createFailure(code: string, message: string, recoverable: boolean, cause?: unknown): DeviceFailure {
  return cause === undefined ? { code, message, recoverable } : { code, message, recoverable, cause };
}

function normalizeFailure(cause: unknown): DeviceFailure {
  if (isDeviceFailure(cause)) return cause;
  return createFailure("DEVICE_UNEXPECTED_ERROR", "An unexpected device error occurred.", true, cause);
}

function isDeviceFailure(value: unknown): value is DeviceFailure {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DeviceFailure>;
  return typeof candidate.code === "string" && typeof candidate.message === "string" && typeof candidate.recoverable === "boolean";
}
