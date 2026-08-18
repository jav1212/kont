export type ClientLifecycleStatus =
  | "stopped"
  | "starting"
  | "ready"
  | "stopping"
  | "failed";

export interface ClientFailure {
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
  readonly requestId: string | null;
}

export type ClientLifecycleSnapshot =
  | { readonly status: Exclude<ClientLifecycleStatus, "failed"> }
  | { readonly status: "failed"; readonly failure: ClientFailure };

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

