import { summarizePortalMonitoring, type PortalMonitoringSnapshot, type PortalStatus } from "@kontave/portal-monitoring-domain";

export interface PortalMonitoringRepository {
  listActivePortalStatuses(): Promise<readonly PortalStatus[]>;
}

export class GetPortalMonitoring {
  constructor(private readonly repository: PortalMonitoringRepository) {}

  async execute(): Promise<PortalMonitoringSnapshot> {
    return summarizePortalMonitoring(await this.repository.listActivePortalStatuses());
  }
}
