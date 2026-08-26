import type {
  ConnectivityClock,
  ConnectivityProbe,
  ConnectivityUnexpectedFailureObserver,
} from "@kontave/client-connectivity-application";
import type { ConnectivityProbeResult } from "@kontave/client-connectivity-contracts";

type QueuedProbeOutcome =
  | { readonly kind: "result"; readonly result: ConnectivityProbeResult }
  | { readonly kind: "failure"; readonly cause: unknown };

export class QueueConnectivityProbe implements ConnectivityProbe {
  private readonly outcomes: QueuedProbeOutcome[] = [];
  calls = 0;

  enqueue(result: ConnectivityProbeResult): void {
    this.outcomes.push({ kind: "result", result });
  }

  enqueueFailure(cause: unknown): void {
    this.outcomes.push({ kind: "failure", cause });
  }

  async check(): Promise<ConnectivityProbeResult> {
    this.calls += 1;
    const outcome = this.outcomes.shift();
    if (!outcome) throw new Error("No connectivity probe outcome was queued.");
    if (outcome.kind === "failure") throw outcome.cause;
    return outcome.result;
  }
}

export class FixedConnectivityClock implements ConnectivityClock {
  constructor(private instant: string = "2026-08-14T00:00:00.000Z") {}

  set(instant: string): void {
    this.instant = instant;
  }

  now(): string {
    return this.instant;
  }
}

export class RecordingConnectivityUnexpectedFailureObserver implements ConnectivityUnexpectedFailureObserver {
  readonly causes: unknown[] = [];

  record(cause: unknown): void {
    this.causes.push(cause);
  }
}
