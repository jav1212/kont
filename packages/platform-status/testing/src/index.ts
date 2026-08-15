import type { PlatformStatusRepository } from "@kontave/platform-status-application";
import type { PortalStatus } from "@kontave/platform-status-domain";

export class InMemoryPlatformStatusRepository implements PlatformStatusRepository {
  constructor(public portals: readonly PortalStatus[] = []) {}

  async listActivePortalStatuses(): Promise<readonly PortalStatus[]> {
    return this.portals;
  }
}
