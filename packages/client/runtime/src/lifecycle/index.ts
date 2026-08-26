import { ClientLifecycleStatus } from "@kontave/client-contracts";
import type {
  ClientFailure,
  ClientFeatureRegistry,
  ClientLifecycleSnapshot,
  ClientSubscriber,
  KontaveClient,
} from "@kontave/client-contracts";

export interface ClientRuntimeModule {
  /** Initializes resources owned by the module before the client becomes ready. */
  start(): void | Promise<void>;
  /** Releases resources owned by the module during shutdown or startup rollback. */
  stop(): void | Promise<void>;
}

export interface KontaveClientRuntimeOptions<
  TFeatures extends ClientFeatureRegistry,
> {
  readonly features: TFeatures;
  readonly modules?: readonly ClientRuntimeModule[];
  readonly observeUnexpectedFailure?: (cause: unknown) => void;
}

/**
 * Portable composition root. Capability packages retain their business logic;
 * the runtime only owns lifecycle and exposes their already-typed facades.
 * @param options - Typed feature registry, ordered runtime modules and failure observer.
 * @returns A headless Kontave client with deterministic lifecycle semantics.
 */
export function createKontaveClient<TFeatures extends ClientFeatureRegistry>(
  options: KontaveClientRuntimeOptions<TFeatures>,
): KontaveClient<TFeatures> {
  return new DefaultKontaveClient(options);
}

class DefaultKontaveClient<TFeatures extends ClientFeatureRegistry>
  implements KontaveClient<TFeatures>
{
  readonly features: TFeatures;
  private readonly modules: readonly ClientRuntimeModule[];
  private readonly subscribers = new Set<
    ClientSubscriber<ClientLifecycleSnapshot>
  >();
  private lifecycle: ClientLifecycleSnapshot = Object.freeze({
    status: ClientLifecycleStatus.Stopped,
  });
  private transition: Promise<void> | null = null;

  constructor(
    private readonly options: KontaveClientRuntimeOptions<TFeatures>,
  ) {
    this.features = Object.freeze({ ...options.features });
    this.modules = Object.freeze([...(options.modules ?? [])]);
  }

  getLifecycleSnapshot = (): ClientLifecycleSnapshot => this.lifecycle;

  subscribeLifecycle = (
    subscriber: ClientSubscriber<ClientLifecycleSnapshot>,
  ): (() => void) => {
    this.subscribers.add(subscriber);
    subscriber(this.lifecycle);
    return () => {
      this.subscribers.delete(subscriber);
    };
  };

  async start(): Promise<void> {
    if (this.lifecycle.status === ClientLifecycleStatus.Ready) return;
    if (this.transition) return this.transition;
    this.transition = this.runStart();
    try {
      await this.transition;
    } finally {
      this.transition = null;
    }
  }

  async stop(): Promise<void> {
    if (this.transition) await this.transition;
    if (this.lifecycle.status === ClientLifecycleStatus.Stopped) return;
    this.transition = this.runStop();
    try {
      await this.transition;
    } finally {
      this.transition = null;
    }
  }

  private async runStart(): Promise<void> {
    this.publish({ status: ClientLifecycleStatus.Starting });
    const started: ClientRuntimeModule[] = [];
    try {
      for (const module of this.modules) {
        await module.start();
        started.push(module);
      }
      this.publish({ status: ClientLifecycleStatus.Ready });
    } catch (cause: unknown) {
      for (const module of started.reverse())
        await safelyStop(module, this.options.observeUnexpectedFailure);
      this.options.observeUnexpectedFailure?.(cause);
      this.publish({
        status: ClientLifecycleStatus.Failed,
        failure: normalizeFailure(cause, "CLIENT_START_FAILED"),
      });
      throw cause;
    }
  }

  private async runStop(): Promise<void> {
    this.publish({ status: ClientLifecycleStatus.Stopping });
    let firstFailure: unknown;
    for (const module of [...this.modules].reverse()) {
      try {
        await module.stop();
      } catch (cause: unknown) {
        firstFailure ??= cause;
        this.options.observeUnexpectedFailure?.(cause);
      }
    }
    if (firstFailure !== undefined) {
      this.publish({
        status: ClientLifecycleStatus.Failed,
        failure: normalizeFailure(firstFailure, "CLIENT_STOP_FAILED"),
      });
      throw firstFailure;
    }
    this.publish({ status: ClientLifecycleStatus.Stopped });
  }

  private publish(snapshot: ClientLifecycleSnapshot): void {
    this.lifecycle = Object.freeze(snapshot);
    for (const subscriber of this.subscribers) subscriber(this.lifecycle);
  }
}

async function safelyStop(
  module: ClientRuntimeModule,
  observer?: (cause: unknown) => void,
): Promise<void> {
  try {
    await module.stop();
  } catch (cause: unknown) {
    observer?.(cause);
  }
}

function normalizeFailure(cause: unknown, fallbackCode: string): ClientFailure {
  if (
    isRecord(cause) &&
    typeof cause.code === "string" &&
    typeof cause.message === "string"
  ) {
    return Object.freeze({
      code: cause.code,
      message: cause.message,
      recoverable:
        typeof cause.recoverable === "boolean" ? cause.recoverable : false,
      requestId: typeof cause.requestId === "string" ? cause.requestId : null,
    });
  }
  return Object.freeze({
    code: fallbackCode,
    message:
      cause instanceof Error
        ? cause.message
        : "Kontave client lifecycle failed.",
    recoverable: false,
    requestId: null,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
