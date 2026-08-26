import type {
  DeviceCapability,
  DeviceDescriptor,
  DeviceEvent,
  DeviceFailure,
  DeviceFailureCode,
  DeviceLifecycleState,
  DeviceSessionEvent,
} from "@kontave/devices/contracts";

/** Discovered device paired with the adapter that owns its connection. */
export interface DeviceCandidate {
  readonly descriptor: DeviceDescriptor;
  readonly adapterId: string;
}

/** Active connection to one physical device. */
export interface DeviceSession {
  readonly device: DeviceDescriptor;
  /**
   * Subscribes to events produced by the active device.
   * @param listener - Callback receiving portable session events.
   * @returns A function that removes the subscription.
   */
  subscribe(listener: (event: DeviceSessionEvent) => void): () => void;
  /**
   * Closes the physical connection and releases session resources.
   * @returns A promise that resolves after disconnection completes.
   * @throws A platform failure when the connection cannot be closed cleanly.
   */
  disconnect(): Promise<void>;
}

/** Platform adapter capable of discovering and connecting compatible devices. */
export interface DeviceAdapter {
  readonly id: string;
  readonly capabilities: readonly DeviceCapability[];
  /**
   * Discovers currently available compatible devices.
   * @param signal - Cancellation signal for the discovery operation.
   * @returns Candidates owned by this adapter.
   * @throws A typed or platform failure when discovery cannot complete.
   */
  discover(signal: AbortSignal): Promise<readonly DeviceCandidate[]>;
  /**
   * Connects a candidate previously discovered by this adapter.
   * @param candidate - Candidate selected by orchestration.
   * @param signal - Cancellation signal for the connection attempt.
   * @returns An active device session.
   * @throws A typed or platform failure when connection cannot be established.
   */
  connect(candidate: DeviceCandidate, signal: AbortSignal): Promise<DeviceSession>;
}

/** Event publication port owned by device orchestration. */
export interface DeviceEventSink {
  /**
   * Publishes one portable device event.
   * @param event - Event produced by orchestration or an active session.
   * @returns Nothing.
   */
  publish(event: DeviceEvent): void;
}

/** Structured logging port for device orchestration. */
export interface DeviceLogger {
  /**
   * Records an informational device event.
   * @param code - Stable diagnostic event code.
   * @param context - Optional bounded structured context.
   * @returns Nothing.
   */
  info(code: string, context?: Readonly<Record<string, unknown>>): void;
  /**
   * Records a typed device failure.
   * @param failure - Failure produced by orchestration or an adapter.
   * @param context - Optional bounded structured context.
   * @returns Nothing.
   */
  error(failure: DeviceFailure, context?: Readonly<Record<string, unknown>>): void;
}

/** Explicit dependencies required by the device manager. */
export interface DeviceManagerDependencies {
  readonly adapters: readonly DeviceAdapter[];
  readonly events: DeviceEventSink;
  readonly logger: DeviceLogger;
  readonly selection?: DeviceSelectionPolicy;
  readonly sleeper?: Sleeper;
}

/** Policy selecting one candidate from a discovery result. */
export interface DeviceSelectionPolicy {
  /**
   * Selects a device candidate deterministically.
   * @param candidates - Candidates returned by compatible adapters.
   * @returns The selected candidate, or `undefined` when none is suitable.
   */
  select(candidates: readonly DeviceCandidate[]): DeviceCandidate | undefined;
}

/** Cancellation-aware delay port used by reconnection orchestration. */
export interface Sleeper {
  /**
   * Waits for a bounded delay or rejects when cancelled.
   * @param delayMs - Non-negative delay in milliseconds.
   * @param signal - Cancellation signal for the wait.
   * @returns A promise that resolves after the delay.
   * @throws A cancellation failure when the signal aborts.
   */
  sleep(delayMs: number, signal: AbortSignal): Promise<void>;
}

/** Policy controlling bounded reconnection attempts. */
export interface ReconnectionPolicy {
  readonly maximumAttempts: number;
  /**
   * Calculates the delay following a failed attempt.
   * @param attempt - One-based failed attempt number.
   * @returns Delay in milliseconds before the next attempt.
   */
  delayAfterFailure(attempt: number): number;
}

/** Optional selection and reconnection behavior for a connection request. */
export interface ConnectOptions {
  readonly preferredDeviceId?: string;
  readonly reconnection?: ReconnectionPolicy;
}

/** Selection policy preferring a configured device before insertion order. */
export class OrderedDeviceSelectionPolicy implements DeviceSelectionPolicy {
  /**
   * Creates an ordered selection policy.
   * @param preferredDeviceId - Optional device identifier to prefer.
   */
  constructor(private readonly preferredDeviceId?: string) {}

  /** {@inheritDoc DeviceSelectionPolicy.select} */
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

/** Bounded exponential delay policy for device reconnection. */
export class ExponentialBackoffPolicy implements ReconnectionPolicy {
  /**
   * Creates an exponential reconnection policy.
   * @param maximumAttempts - Maximum number of connection attempts.
   * @param initialDelayMs - Delay following the first recoverable failure.
   * @param maximumDelayMs - Upper bound applied to calculated delays.
   * @throws {RangeError} When maximum attempts is not a positive integer.
   */
  constructor(
    readonly maximumAttempts = 5,
    private readonly initialDelayMs = 250,
    private readonly maximumDelayMs = 5_000,
  ) {
    if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1) {
      throw new RangeError("maximumAttempts must be a positive integer.");
    }
  }

  /** {@inheritDoc ReconnectionPolicy.delayAfterFailure} */
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

  /**
   * Creates a device manager with explicit ports and policies.
   * @param dependencies - Adapters, event sink, logger, and optional policies.
   */
  constructor(private readonly dependencies: DeviceManagerDependencies) {}

  /** Current orchestration lifecycle state. */
  get state(): DeviceLifecycleState {
    return this.stateValue;
  }

  /** Descriptor of the active device, when connected. */
  get connectedDevice(): DeviceDescriptor | undefined {
    return this.session?.device;
  }

  /**
   * Discovers and connects the first selected device providing a capability.
   * A new request cancels any prior in-flight connection request.
   * @param capability - Required business capability.
   * @param options - Optional preferred device and reconnection policy.
   * @returns The connected device descriptor.
   * @throws {DeviceFailure} When discovery, selection, connection, or cancellation fails.
   */
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

  /**
   * Cancels in-flight work, disconnects the active session, and stops the manager.
   * @returns A promise that resolves after resources are released and events published.
   * @throws A platform failure when the active session cannot disconnect.
   */
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
