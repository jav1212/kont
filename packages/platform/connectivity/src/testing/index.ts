import type {
  ConnectivityClock,
  ConnectivityProbe,
  ConnectivityUnexpectedFailureObserver,
} from "../application";
import type { ConnectivityProbeResult } from "../contracts";

type QueuedProbeOutcome =
  | { readonly kind: "result"; readonly result: ConnectivityProbeResult }
  | { readonly kind: "failure"; readonly cause: unknown };

export class QueueConnectivityProbe implements ConnectivityProbe {
  private readonly outcomes: QueuedProbeOutcome[] = [];
  calls = 0;

  /**
   * Queues semantic reachability evidence for the next probe call.
   * @param result - Probe result returned in FIFO order.
   * @returns Nothing after appending the result.
   */
  enqueue(result: ConnectivityProbeResult): void {
    this.outcomes.push({ kind: "result", result });
  }

  /**
   * Queues an unexpected failure for the next probe call.
   * @param cause - Rejection reason thrown in FIFO order.
   * @returns Nothing after appending the failure.
   */
  enqueueFailure(cause: unknown): void {
    this.outcomes.push({ kind: "failure", cause });
  }

  /** {@inheritDoc ConnectivityProbe.check} */
  async check(): Promise<ConnectivityProbeResult> {
    this.calls += 1;
    const outcome = this.outcomes.shift();
    if (!outcome) throw new Error("No connectivity probe outcome was queued.");
    if (outcome.kind === "failure") throw outcome.cause;
    return outcome.result;
  }
}

export class FixedConnectivityClock implements ConnectivityClock {
  /**
   * Creates a mutable deterministic clock for tests.
   * @param instant - Initial ISO-compatible timestamp.
   */
  constructor(private instant: string = "2026-08-14T00:00:00.000Z") {}

  /**
   * Replaces the instant returned by subsequent reads.
   * @param instant - Timestamp used by the next monitor observation.
   * @returns Nothing after updating the clock.
   */
  set(instant: string): void {
    this.instant = instant;
  }

  /** {@inheritDoc ConnectivityClock.now} */
  now(): string {
    return this.instant;
  }
}

export class RecordingConnectivityUnexpectedFailureObserver implements ConnectivityUnexpectedFailureObserver {
  readonly causes: unknown[] = [];

  /** {@inheritDoc ConnectivityUnexpectedFailureObserver.record} */
  record(cause: unknown): void {
    this.causes.push(cause);
  }
}
