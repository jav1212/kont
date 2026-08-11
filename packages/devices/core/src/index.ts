import type {
  DeviceCapability,
  DeviceDescriptor,
  DeviceEvent,
  DeviceFailure,
  DeviceFailureCode,
  DeviceLifecycleState,
  DeviceSessionEvent,
} from "@kontave/device-contracts";

export interface DeviceCandidate {
  readonly descriptor: DeviceDescriptor;
  readonly adapterId: string;
}

export interface DeviceSession {
  readonly device: DeviceDescriptor;
  subscribe(listener: (event: DeviceSessionEvent) => void): () => void;
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
  readonly selection?: DeviceSelectionPolicy;
  readonly sleeper?: Sleeper;
}

export interface DeviceSelectionPolicy {
  select(candidates: readonly DeviceCandidate[]): DeviceCandidate | undefined;
}

export interface Sleeper {
  sleep(delayMs: number, signal: AbortSignal): Promise<void>;
}

export interface ReconnectionPolicy {
  readonly maximumAttempts: number;
  delayAfterFailure(attempt: number): number;
}

export interface ConnectOptions {
  readonly preferredDeviceId?: string;
  readonly reconnection?: ReconnectionPolicy;
}

export class OrderedDeviceSelectionPolicy implements DeviceSelectionPolicy {
  constructor(private readonly preferredDeviceId?: string) {}

  select(candidates: readonly DeviceCandidate[]): DeviceCandidate | undefined {
    if (this.preferredDeviceId) {
      const preferred = candidates.find(
        (candidate) => candidate.descriptor.id === this.preferredDeviceId,
      );
      if (preferred) return preferred;
    }
    return candidates[0];
  }
}

export class ExponentialBackoffPolicy implements ReconnectionPolicy {
  constructor(
    readonly maximumAttempts = 5,
    private readonly initialDelayMs = 250,
    private readonly maximumDelayMs = 5_000,
  ) {
    if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1) {
      throw new RangeError("maximumAttempts must be a positive integer.");
    }
  }

  delayAfterFailure(attempt: number): number {
    return Math.min(this.initialDelayMs * 2 ** Math.max(0, attempt - 1), this.maximumDelayMs);
  }
}

/** Coordinates adapters while remaining independent of hardware and UI frameworks. */
export class DeviceManager {
  private stateValue: DeviceLifecycleState = "idle";
  private session: DeviceSession | undefined;
  private unsubscribeFromSession: (() => void) | undefined;
  private operation: AbortController | undefined;

  constructor(private readonly dependencies: DeviceManagerDependencies) {}

  get state(): DeviceLifecycleState {
    return this.stateValue;
  }

  get connectedDevice(): DeviceDescriptor | undefined {
    return this.session?.device;
  }

  async connectFirst(
    capability: DeviceCapability,
    options: ConnectOptions = {},
  ): Promise<DeviceDescriptor> {
    this.cancelCurrentOperation();
    const operation = new AbortController();
    this.operation = operation;

    try {
      return await this.connectUsingPolicy(capability, options, operation.signal);
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

  private async connectUsingPolicy(
    capability: DeviceCapability,
    options: ConnectOptions,
    signal: AbortSignal,
  ): Promise<DeviceDescriptor> {
    const policy = options.reconnection;
    const maximumAttempts = policy?.maximumAttempts ?? 1;
    let lastFailure: DeviceFailure | undefined;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        return await this.connectOnce(capability, options.preferredDeviceId, signal);
      } catch (cause: unknown) {
        const failure = normalizeFailure(cause);
        lastFailure = failure;
        if (!failure.recoverable || attempt === maximumAttempts) throw failure;

        this.transition("reconnecting");
        const delayMs = policy?.delayAfterFailure(attempt) ?? 0;
        this.dependencies.logger.info("DEVICE_RECONNECT_SCHEDULED", { attempt, delayMs });
        await (this.dependencies.sleeper ?? systemSleeper).sleep(delayMs, signal);
      }
    }

    throw lastFailure ?? createFailure("DEVICE_UNEXPECTED_ERROR", "Device connection failed.", true);
  }

  private async connectOnce(
    capability: DeviceCapability,
    preferredDeviceId: string | undefined,
    signal: AbortSignal,
  ): Promise<DeviceDescriptor> {
    const compatibleAdapters = this.dependencies.adapters.filter((adapter) =>
      adapter.capabilities.includes(capability),
    );
    if (compatibleAdapters.length === 0) {
      throw createFailure("DEVICE_CAPABILITY_UNSUPPORTED", `No adapter provides ${capability}.`, false);
    }

    this.transition("discovering");
    const discovered = await Promise.all(
      compatibleAdapters.map((adapter) => adapter.discover(signal)),
    );
    const candidates = discovered.flat();
    const selection =
      this.dependencies.selection ?? new OrderedDeviceSelectionPolicy(preferredDeviceId);
    const candidate = selection.select(candidates);
    if (!candidate) {
      throw createFailure("DEVICE_NOT_FOUND", `No device providing ${capability} was found.`, true);
    }

    const adapter = compatibleAdapters.find((item) => item.id === candidate.adapterId);
    if (!adapter) {
      throw createFailure("DEVICE_UNEXPECTED_ERROR", "The selected adapter is not registered.", false);
    }

    this.transition("connecting");
    this.session = await adapter.connect(candidate, signal);
    this.unsubscribeFromSession?.();
    this.unsubscribeFromSession = this.session.subscribe((event) => {
      this.dependencies.events.publish(event);
      if (event.type === "device.disconnected") {
        this.session = undefined;
        this.unsubscribeFromSession?.();
        this.unsubscribeFromSession = undefined;
        this.transition("reconnecting");
      } else if (event.type === "device.failed") {
        this.dependencies.logger.error(event.failure, {
          deviceId: this.session?.device.id,
        });
      }
    });
    this.transition("ready");
    this.dependencies.events.publish({ type: "device.connected", device: this.session.device });
    this.dependencies.logger.info("DEVICE_CONNECTED", {
      adapterId: adapter.id,
      deviceId: this.session.device.id,
    });
    return this.session.device;
  }

  async stop(): Promise<void> {
    this.cancelCurrentOperation();
    const currentSession = this.session;
    this.session = undefined;
    this.unsubscribeFromSession?.();
    this.unsubscribeFromSession = undefined;
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

function createFailure(code: DeviceFailureCode, message: string, recoverable: boolean, cause?: unknown): DeviceFailure {
  return cause === undefined ? { code, message, recoverable } : { code, message, recoverable, cause };
}

function normalizeFailure(cause: unknown): DeviceFailure {
  if (isDeviceFailure(cause)) return cause;
  return createFailure("DEVICE_UNEXPECTED_ERROR", "An unexpected device error occurred.", true, cause);
}

function isDeviceFailure(value: unknown): value is DeviceFailure {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DeviceFailure>;
  return isFailureCode(candidate.code) && typeof candidate.message === "string" && typeof candidate.recoverable === "boolean";
}

function isFailureCode(value: unknown): value is DeviceFailureCode {
  return typeof value === "string" && DEVICE_FAILURE_CODES.has(value as DeviceFailureCode);
}

const DEVICE_FAILURE_CODES: ReadonlySet<DeviceFailureCode> = new Set([
  "DEVICE_CAPABILITY_UNSUPPORTED",
  "DEVICE_NOT_FOUND",
  "DEVICE_CONNECTION_FAILED",
  "DEVICE_CONNECTION_LOST",
  "DEVICE_PERMISSION_DENIED",
  "DEVICE_OPERATION_CANCELLED",
  "DEVICE_PROTOCOL_INCOMPATIBLE",
  "DEVICE_UNEXPECTED_ERROR",
]);

const systemSleeper: Sleeper = {
  sleep(delayMs, signal) {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(createFailure("DEVICE_OPERATION_CANCELLED", "The device operation was cancelled.", true));
        return;
      }

      const timeout = setTimeout(resolve, delayMs);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          reject(createFailure("DEVICE_OPERATION_CANCELLED", "The device operation was cancelled.", true));
        },
        { once: true },
      );
    });
  },
};
