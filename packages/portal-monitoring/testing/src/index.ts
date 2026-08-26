import type { PortalMonitoringRepository } from "@kontave/portal-monitoring-application";
import type { PortalStatus } from "@kontave/portal-monitoring-domain";

export class InMemoryPortalMonitoringRepository implements PortalMonitoringRepository {
  constructor(public portals: readonly PortalStatus[] = []) {}

  async listActivePortalStatuses(): Promise<readonly PortalStatus[]> {
    return this.portals;
  }
}
