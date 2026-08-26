import type {
  ConnectivityAvailability,
  ConnectivityFailureReason,
  ConnectivityProbeResult,
  ConnectivitySnapshot,
} from "@kontave/client-connectivity-contracts";

export interface ConnectivityProbe {
  check(): Promise<ConnectivityProbeResult>;
}

export interface ConnectivityClock {
  now(): string;
}

export interface ConnectivityUnexpectedFailureObserver {
  record(cause: unknown): void;
}

export interface ConnectivityMonitorOptions {
  readonly probe: ConnectivityProbe;
  readonly failureThreshold?: number;
  readonly clock?: ConnectivityClock;
  readonly unexpectedFailureObserver?: ConnectivityUnexpectedFailureObserver;
}

export type ConnectivityListener = () => void;
export type ClientConnectivityFailureCode = "CONNECTIVITY_INVALID_CONFIGURATION";

export class ClientConnectivityFailure extends Error {
  constructor(readonly code: ClientConnectivityFailureCode, message: string) {
    super(message);
    this.name = "ClientConnectivityFailure";
  }
}

const INITIAL_SNAPSHOT: ConnectivitySnapshot = Object.freeze({
  availability: "unknown",
  checking: false,
  reason: null,
  observedAt: null,
  consecutiveFailures: 0,
});

const SYSTEM_CLOCK: ConnectivityClock = Object.freeze({
  now: () => new Date().toISOString(),
});

export class ConnectivityMonitor {
  private readonly listeners = new Set<ConnectivityListener>();
  private readonly probe: ConnectivityProbe;
  private readonly failureThreshold: number;
  private readonly clock: ConnectivityClock;
  private readonly unexpectedFailureObserver: ConnectivityUnexpectedFailureObserver | undefined;
  private snapshot: ConnectivitySnapshot = INITIAL_SNAPSHOT;
  private refreshInFlight: Promise<ConnectivitySnapshot> | null = null;

  constructor(options: ConnectivityMonitorOptions) {
    if (!Number.isInteger(options.failureThreshold ?? 3) || (options.failureThreshold ?? 3) < 1) {
      throw new ClientConnectivityFailure("CONNECTIVITY_INVALID_CONFIGURATION", "Connectivity failure threshold must be a positive integer.");
    }
    this.probe = options.probe;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.clock = options.clock ?? SYSTEM_CLOCK;
    this.unexpectedFailureObserver = options.unexpectedFailureObserver;
  }

  getSnapshot = (): ConnectivitySnapshot => this.snapshot;

  subscribe = (listener: ConnectivityListener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  refresh(): Promise<ConnectivitySnapshot> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const operation = this.performRefresh().finally(() => {
      if (this.refreshInFlight === operation) this.refreshInFlight = null;
    });
    this.refreshInFlight = operation;
    return operation;
  }

  private async performRefresh(): Promise<ConnectivitySnapshot> {
    this.publish({ ...this.snapshot, checking: true });
    let result: ConnectivityProbeResult;
    try {
      result = await this.probe.check();
    } catch (cause: unknown) {
      this.recordUnexpectedFailure(cause);
      result = { reachable: false, reason: "service_unreachable" };
    }

    const observedAt = validInstant(this.clock.now());
    if (result.reachable) {
      this.publish({
        availability: "available",
        checking: false,
        reason: null,
        observedAt,
        consecutiveFailures: 0,
      });
      return this.snapshot;
    }

    const reason = validReason(result.reason);
    const consecutiveFailures = this.snapshot.consecutiveFailures + 1;
    this.publish({
      availability: resolveFailureAvailability(this.snapshot.availability, consecutiveFailures, this.failureThreshold),
      checking: false,
      reason,
      observedAt,
      consecutiveFailures,
    });
    return this.snapshot;
  }

  private recordUnexpectedFailure(cause: unknown): void {
    try {
      this.unexpectedFailureObserver?.record(cause);
    } catch {
      // Observability is best effort and cannot replace the connectivity evidence.
    }
  }

  private publish(snapshot: ConnectivitySnapshot): void {
    this.snapshot = Object.freeze({ ...snapshot });
    for (const listener of [...this.listeners]) listener();
  }
}

function resolveFailureAvailability(
  current: ConnectivityAvailability,
  consecutiveFailures: number,
  threshold: number,
): ConnectivityAvailability {
  if (consecutiveFailures >= threshold) return "unavailable";
  return current === "unknown" ? "unknown" : "degraded";
}

function validReason(reason: ConnectivityFailureReason): ConnectivityFailureReason {
  if (reason === "network_unreachable" || reason === "service_unreachable" || reason === "probe_timeout") return reason;
  throw new ClientConnectivityFailure("CONNECTIVITY_INVALID_CONFIGURATION", "Connectivity probe returned an invalid failure reason.");
}

function validInstant(value: string): string {
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    throw new ClientConnectivityFailure("CONNECTIVITY_INVALID_CONFIGURATION", "Connectivity clock returned an invalid instant.");
  }
  return value;
}
