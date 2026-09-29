/** Handle returned by a platform scheduler for one delayed query. */
export type QueryDelayHandle = unknown;

/** Platform clock used to schedule a query without coupling application code to a runtime. */
export interface QueryDelayScheduler {
  /**
   * Schedules one callback after a nonnegative delay.
   * @param callback - Work to start when the delay expires.
   * @param delayMilliseconds - Delay before invoking the callback.
   * @returns An opaque handle that the same scheduler can cancel.
   */
  schedule(callback: () => void, delayMilliseconds: number): QueryDelayHandle;

  /**
   * Cancels a callback that has not started.
   * @param handle - Handle returned by {@link schedule}.
   * @returns Nothing after requesting cancellation.
   */
  cancel(handle: QueryDelayHandle): void;
}

/** A query operation that also exposes transport-specific cancellation. */
export interface CancelableQuery<TValue> {
  /** Resolves with the response or rejects with the transport failure. */
  readonly result: Promise<TValue>;
  /** Cancels the active request when its runtime supports cancellation. */
  cancel(): void;
}

/** Completion returned only for the newest scheduled query. */
export type DebouncedQueryResult<TValue> =
  | { readonly status: "completed"; readonly value: TValue }
  | { readonly status: "failed"; readonly error: unknown }
  | { readonly status: "superseded" };

interface PendingQuery<TValue> {
  readonly generation: number;
  readonly resolve: (result: DebouncedQueryResult<TValue>) => void;
  readonly delay: QueryDelayHandle;
}

interface RunningQuery<TValue> {
  readonly generation: number;
  readonly operation: CancelableQuery<TValue>;
  readonly resolve: (result: DebouncedQueryResult<TValue>) => void;
}

/**
 * Runs the latest query after a quiet period and suppresses superseded responses.
 * Each instance owns an independent search stream, so unrelated screens never cancel each other.
 */
export class DebouncedQuery<TInput, TValue> {
  private generation = 0;
  private pending: PendingQuery<TValue> | null = null;
  private running: RunningQuery<TValue> | null = null;

  /**
   * Connects a query executor to an explicit platform scheduler.
   * @param execute - Creates one request and its cancellation operation.
   * @param scheduler - Clock used to delay and cancel a pending request.
   * @throws Never during construction.
   */
  constructor(
    private readonly execute: (input: TInput) => CancelableQuery<TValue>,
    private readonly scheduler: QueryDelayScheduler,
  ) {}

  /**
   * Replaces pending work and starts the latest query after the quiet period.
   * @param input - Immutable filters and page information captured for this request.
   * @param delayMilliseconds - Quiet period before sending the request; defaults to 350 ms.
   * @returns A completion, failure, or superseded result without rejecting for transport errors.
   * @throws {RangeError} When the delay is negative or not finite.
   */
  schedule(input: TInput, delayMilliseconds = 350): Promise<DebouncedQueryResult<TValue>> {
    if (!Number.isFinite(delayMilliseconds) || delayMilliseconds < 0) {
      throw new RangeError("Query delay must be a finite nonnegative number.");
    }
    this.supersedeCurrent();
    const generation = ++this.generation;
    return new Promise((resolve) => {
      const delay = this.scheduler.schedule(() => {
        if (this.pending?.generation !== generation) {
          resolve({ status: "superseded" });
          return;
        }
        this.pending = null;
        this.start(generation, input, resolve);
      }, delayMilliseconds);
      this.pending = { generation, resolve, delay };
    });
  }

  /**
   * Cancels a pending debounce and starts the supplied filters immediately.
   * @param input - Current filters and page information to query.
   * @returns A completion, failure, or superseded result.
   * @throws Never for a valid query input.
   */
  runImmediately(input: TInput): Promise<DebouncedQueryResult<TValue>> {
    this.supersedeCurrent();
    const generation = ++this.generation;
    return new Promise((resolve) => this.start(generation, input, resolve));
  }

  /**
   * Cancels pending and active work and makes their results stale.
   * @returns Nothing after resolving superseded operations.
   */
  cancel(): void {
    this.supersedeCurrent();
    this.generation++;
  }

  private supersedeCurrent(): void {
    if (this.pending) {
      this.scheduler.cancel(this.pending.delay);
      this.pending.resolve({ status: "superseded" });
      this.pending = null;
    }
    if (this.running) {
      const running = this.running;
      this.running = null;
      running.operation.cancel();
      running.resolve({ status: "superseded" });
    }
  }

  private start(
    generation: number,
    input: TInput,
    resolve: (result: DebouncedQueryResult<TValue>) => void,
  ): void {
    let operation: CancelableQuery<TValue>;
    try {
      operation = this.execute(input);
    } catch (error) {
      resolve({ status: "failed", error });
      return;
    }
    const running: RunningQuery<TValue> = { generation, operation, resolve };
    this.running = running;
    void operation.result.then(
      (value) => {
        if (this.running !== running || this.generation !== generation) {
          resolve({ status: "superseded" });
          return;
        }
        this.running = null;
        resolve({ status: "completed", value });
      },
      (error: unknown) => {
        if (this.running !== running || this.generation !== generation) {
          resolve({ status: "superseded" });
          return;
        }
        this.running = null;
        resolve({ status: "failed", error });
      },
    );
  }
}
