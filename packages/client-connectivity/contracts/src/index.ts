export type ConnectivityAvailability = "unknown" | "available" | "degraded" | "unavailable";
export type ConnectivityFailureReason = "network_unreachable" | "service_unreachable" | "probe_timeout";

export interface ConnectivitySnapshot {
  readonly availability: ConnectivityAvailability;
  readonly checking: boolean;
  readonly reason: ConnectivityFailureReason | null;
  readonly observedAt: string | null;
  readonly consecutiveFailures: number;
}

export type ConnectivityProbeResult =
  | { readonly reachable: true }
  | { readonly reachable: false; readonly reason: ConnectivityFailureReason };
