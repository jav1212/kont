export type PortalAvailability =
  | "operational"
  | "degraded"
  | "down"
  | "unknown";

export interface PortalStatusDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly category: "fiscal" | "laboral" | "mercantil";
  readonly logoUrl: string | null;
  readonly status: PortalAvailability;
  readonly responseTimeMs: number | null;
  readonly checkedAt: string | null;
}

export interface PlatformStatusDto {
  readonly status: PortalAvailability;
  readonly observedAt: string | null;
  readonly summary: {
    readonly operational: number;
    readonly degraded: number;
    readonly down: number;
    readonly unknown: number;
    readonly total: number;
  };
  readonly portals: readonly PortalStatusDto[];
}

/** Application-facing port for monitored platform availability. */
export interface PlatformStatusPort {
  /** @returns Latest platform status snapshot. */
  current(): Promise<PlatformStatusDto>;
}
