import { ClientCapabilityStatus } from "@kontave/client-contracts";
import type {
  ClientCapabilitySnapshot,
  ClientFailure,
  ClientPortFeature,
  ClientSubscriber,
} from "@kontave/client-contracts";
import type { ClientRuntimeModule } from "../lifecycle";

type AsyncOperation = (...arguments_: readonly unknown[]) => Promise<unknown>;
type BoundPort<TPort> = {
  readonly [TKey in keyof TPort]: TPort[TKey] extends (
    ...arguments_: infer TArguments
  ) => Promise<infer TValue>
    ? (...arguments_: TArguments) => Promise<TValue>
    : never;
};

/** Runtime feature and lifecycle module created from explicit port operations. */
export interface PortFeatureRuntime<TPort> {
  readonly feature: ClientPortFeature<TPort>;
  readonly module: ClientRuntimeModule;
}

/**
 * Decorates an explicitly bound application port with observable lifecycle and
 * serializable operation failures.
 * @param operations - Named port operations already bound to their dependency.
 * @returns Feature facade plus its runtime lifecycle module.
 */
export function createPortFeature<TPort>(
  operations: BoundPort<TPort>,
): PortFeatureRuntime<TPort> {
  const state = new PortFeatureState();
  const facade: Record<string, unknown> = {
    getSnapshot: state.getSnapshot,
    subscribe: state.subscribe,
  };

  for (const [name, operation] of Object.entries(operations) as readonly [
    string,
    AsyncOperation,
  ][]) {
    facade[name] = (...arguments_: readonly unknown[]) =>
      state.execute(() => operation(...arguments_));
  }

  // `operations` is supplied as an explicit, capability-owned object by the
  // composition root. This assertion restores its mapped method signatures
  // after JavaScript reflection decorates them without changing their keys.
  const feature = Object.freeze(facade) as ClientPortFeature<TPort>;
  return Object.freeze({ feature, module: state });
}

class PortFeatureState implements ClientRuntimeModule {
  private snapshot: ClientCapabilitySnapshot = Object.freeze({
    status: ClientCapabilityStatus.Stopped,
  });
  private readonly subscribers = new Set<
    ClientSubscriber<ClientCapabilitySnapshot>
  >();

  readonly getSnapshot = (): ClientCapabilitySnapshot => this.snapshot;

  readonly subscribe = (
    subscriber: ClientSubscriber<ClientCapabilitySnapshot>,
  ): (() => void) => {
    this.subscribers.add(subscriber);
    subscriber(this.snapshot);
    return () => this.subscribers.delete(subscriber);
  };

  start(): void {
    this.publish({ status: ClientCapabilityStatus.Ready });
  }

  stop(): void {
    this.publish({ status: ClientCapabilityStatus.Stopped });
  }

  async execute<T>(
    operation: () => Promise<T>,
  ): Promise<
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: ClientFailure }
  > {
    if (this.snapshot.status === ClientCapabilityStatus.Stopped) {
      return {
        ok: false,
        error: {
          code: "CLIENT_FEATURE_NOT_READY",
          message: "La capacidad del cliente todavía no está disponible.",
          recoverable: true,
          requestId: null,
        },
      };
    }
    try {
      const value = await operation();
      if (this.snapshot.status === ClientCapabilityStatus.Failed) {
        this.publish({ status: ClientCapabilityStatus.Ready });
      }
      return { ok: true, value };
    } catch (cause: unknown) {
      const failure = normalizeFailure(cause);
      this.publish({ status: ClientCapabilityStatus.Failed, failure });
      return { ok: false, error: failure };
    }
  }

  private publish(snapshot: ClientCapabilitySnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    for (const subscriber of this.subscribers) subscriber(this.snapshot);
  }
}

function normalizeFailure(cause: unknown): ClientFailure {
  if (isRecord(cause)) {
    return Object.freeze({
      code:
        typeof cause.code === "string" ? cause.code : "CLIENT_OPERATION_FAILED",
      message:
        typeof cause.message === "string"
          ? cause.message
          : "No se pudo completar la operación.",
      recoverable:
        typeof cause.recoverable === "boolean" ? cause.recoverable : true,
      requestId: typeof cause.requestId === "string" ? cause.requestId : null,
    });
  }
  return Object.freeze({
    code: "CLIENT_OPERATION_FAILED",
    message:
      cause instanceof Error
        ? cause.message
        : "No se pudo completar la operación.",
    recoverable: true,
    requestId: null,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
