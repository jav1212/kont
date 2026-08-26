/** Stable lifecycle values for the portable client runtime. */
export enum ClientLifecycleStatus {
  Stopped = "stopped",
  Starting = "starting",
  Ready = "ready",
  Stopping = "stopping",
  Failed = "failed",
}

export interface ClientFailure {
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
  readonly requestId: string | null;
}

/** Serializable outcome returned by commands crossing a client boundary. */
export type ClientOperationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ClientFailure };

/**
 * Converts an asynchronous application port into a renderer-safe result port.
 * Expected failures become serializable values instead of crossing IPC or
 * another transport as framework-specific exceptions.
 */
export type ClientResultPort<TPort> = {
  readonly [TKey in keyof TPort]: TPort[TKey] extends (
    ...arguments_: infer TArguments
  ) => Promise<infer TValue>
    ? (...arguments_: TArguments) => Promise<ClientOperationResult<TValue>>
    : never;
};

/** Stable lifecycle values for a portable client capability. */
export enum ClientCapabilityStatus {
  Stopped = "stopped",
  Ready = "ready",
  Failed = "failed",
}

/** Lifecycle state shared by stateless port-backed client features. */
export type ClientCapabilitySnapshot =
  | { readonly status: ClientCapabilityStatus.Stopped }
  | { readonly status: ClientCapabilityStatus.Ready }
  | {
      readonly status: ClientCapabilityStatus.Failed;
      readonly failure: ClientFailure;
    };

/** Observable, renderer-safe facade for an application port. */
export type ClientPortFeature<TPort> = ClientFeature<ClientCapabilitySnapshot> &
  ClientResultPort<TPort>;

export type ClientLifecycleSnapshot =
  | {
      readonly status: Exclude<
        ClientLifecycleStatus,
        ClientLifecycleStatus.Failed
      >;
    }
  | {
      readonly status: ClientLifecycleStatus.Failed;
      readonly failure: ClientFailure;
    };

export type ClientSubscriber<T> = (snapshot: T) => void;
export type ClientUnsubscribe = () => void;

/**
 * Serializable feature boundary shared by local runtimes and remote proxies
 * such as Electron IPC. Framework-specific state never crosses this contract.
 */
export interface ClientFeature<TSnapshot> {
  /**
   * Returns the latest immutable feature state without starting I/O.
   * @returns The snapshot currently held by the feature.
   */
  getSnapshot(): TSnapshot;
  /**
   * Observes subsequent snapshots and immediately receives the current value.
   * @param subscriber - Consumer invoked whenever the immutable snapshot changes.
   * @returns A function that permanently removes this subscription.
   */
  subscribe(subscriber: ClientSubscriber<TSnapshot>): ClientUnsubscribe;
}

export type ClientFeatureRegistry = Readonly<
  Record<string, ClientFeature<unknown>>
>;

export interface KontaveClient<
  TFeatures extends ClientFeatureRegistry = ClientFeatureRegistry,
> {
  readonly features: TFeatures;
  /** @returns The current lifecycle state without causing a transition. */
  getLifecycleSnapshot(): ClientLifecycleSnapshot;
  /**
   * Observes lifecycle transitions and immediately receives the current state.
   * @param subscriber - Consumer invoked for every lifecycle transition.
   * @returns A function that removes this lifecycle subscription.
   */
  subscribeLifecycle(
    subscriber: ClientSubscriber<ClientLifecycleSnapshot>,
  ): ClientUnsubscribe;
  /**
   * Starts runtime modules in declaration order and coalesces concurrent calls.
   * @returns A promise resolved when every module is ready.
   * @throws The original module failure after previously started modules are rolled back.
   */
  start(): Promise<void>;
  /**
   * Stops runtime modules in reverse declaration order.
   * @returns A promise resolved after all modules release their resources.
   * @throws The first shutdown failure after every module has been given a stop opportunity.
   */
  stop(): Promise<void>;
}

export type PresentationClassification =
  | { readonly status: "ready" }
  | { readonly status: "planned"; readonly reason: string }
  | { readonly status: "unsupported"; readonly reason: string };

export type PresentationRegistry<TFeatures extends ClientFeatureRegistry> = {
  readonly [TKey in keyof TFeatures]: PresentationClassification;
};

/**
 * Freezes an exhaustive platform classification for the client's feature catalog.
 * @param registry - One explicit presentation decision for every client feature.
 * @returns An immutable registry with the same compile-time feature keys.
 */
export function definePresentationRegistry<
  TFeatures extends ClientFeatureRegistry,
>(registry: PresentationRegistry<TFeatures>): PresentationRegistry<TFeatures> {
  return Object.freeze({ ...registry });
}
