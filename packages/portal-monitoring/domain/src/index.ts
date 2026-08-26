export const PortalAvailability = {
  Operational: "operational",
  Degraded: "degraded",
  Down: "down",
  Unknown: "unknown",
} as const;

export type PortalAvailability = typeof PortalAvailability[keyof typeof PortalAvailability];
export type PortalCategory = "fiscal" | "laboral" | "mercantil";

export interface PortalStatus {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly category: PortalCategory;
  readonly logoUrl: string | null;
  readonly status: PortalAvailability;
  readonly responseTimeMs: number | null;
  readonly checkedAt: string | null;
}

export interface PortalStatusSummary {
  readonly operational: number;
  readonly degraded: number;
  readonly down: number;
  readonly unknown: number;
  readonly total: number;
}

export interface PortalMonitoringSnapshot {
  readonly status: PortalAvailability;
  readonly observedAt: string | null;
  readonly summary: PortalStatusSummary;
  readonly portals: readonly PortalStatus[];
}

export type PortalMonitoringFailureCode = "PORTAL_MONITORING_REPOSITORY_UNAVAILABLE";

export class PortalMonitoringFailure extends Error {
  constructor(readonly code: PortalMonitoringFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PortalMonitoringFailure";
  }
}

export function summarizePortalMonitoring(portals: readonly PortalStatus[]): PortalMonitoringSnapshot {
  const summary = portals.reduce<PortalStatusSummary>((current, portal) => ({
    operational: current.operational + Number(portal.status === PortalAvailability.Operational),
    degraded: current.degraded + Number(portal.status === PortalAvailability.Degraded),
    down: current.down + Number(portal.status === PortalAvailability.Down),
    unknown: current.unknown + Number(portal.status === PortalAvailability.Unknown),
    total: current.total + 1,
  }), { operational: 0, degraded: 0, down: 0, unknown: 0, total: 0 });

  return Object.freeze({
    status: aggregateAvailability(summary),
    observedAt: latestObservation(portals),
    summary: Object.freeze(summary),
    portals: Object.freeze([...portals]),
  });
}

function aggregateAvailability(summary: PortalStatusSummary): PortalAvailability {
  if (summary.down > 0) return PortalAvailability.Down;
  if (summary.degraded > 0) return PortalAvailability.Degraded;
  if (summary.unknown > 0 || summary.total === 0) return PortalAvailability.Unknown;
  return PortalAvailability.Operational;
}

function latestObservation(portals: readonly PortalStatus[]): string | null {
  let latest: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const portal of portals) {
    if (!portal.checkedAt) continue;
    const time = Date.parse(portal.checkedAt);
    if (Number.isNaN(time) || time <= latestTime) continue;
    latest = portal.checkedAt;
    latestTime = time;
  }
  return latest;
}
