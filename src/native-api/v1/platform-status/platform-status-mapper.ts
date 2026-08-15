import type { NativePlatformStatusDto } from "@kontave/native-api-contracts";
import type { PlatformStatusSnapshot } from "@kontave/platform-status-domain";

export function toNativePlatformStatusDto(snapshot: PlatformStatusSnapshot): NativePlatformStatusDto {
  return {
    status: snapshot.status,
    observedAt: snapshot.observedAt,
    summary: snapshot.summary,
    portals: snapshot.portals.map((portal) => ({ ...portal })),
  };
}
