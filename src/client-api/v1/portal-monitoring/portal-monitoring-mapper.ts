import type { PortalMonitoringDto } from "@kontave/client-contracts";
import type { PortalMonitoringSnapshot } from "@kontave/portal-monitoring/domain";

export function toPortalMonitoringDto(
  snapshot: PortalMonitoringSnapshot,
): PortalMonitoringDto {
  return {
    status: snapshot.status,
    observedAt: snapshot.observedAt,
    summary: snapshot.summary,
    portals: snapshot.portals.map((portal) => ({ ...portal })),
  };
}
