import type { PlatformStatusDto } from "@kontave/client-contracts";
import type { PlatformStatusSnapshot } from "@kontave/platform-status-domain";

export function toPlatformStatusDto(
  snapshot: PlatformStatusSnapshot,
): PlatformStatusDto {
  return {
    status: snapshot.status,
    observedAt: snapshot.observedAt,
    summary: snapshot.summary,
    portals: snapshot.portals.map((portal) => ({ ...portal })),
  };
}
