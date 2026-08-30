import { PortalMonitoringFailure, summarizePortalMonitoring, type PortalMonitoringSnapshot, type PortalStatus } from "@kontave/portal-monitoring-domain";

export interface PortalMonitoringRepository {
  /**
   * Lists active portals with their latest persisted status.
   *
   * @returns Portal observations ordered for presentation.
   * @throws {PortalMonitoringFailure} When monitoring persistence is unavailable.
   */
  listActivePortalStatuses(): Promise<readonly PortalStatus[]>;
}

/** Reads portal observations and produces their aggregate monitoring snapshot. */
export class GetPortalMonitoring {
  /**
   * Creates the portal-monitoring query.
   *
   * @param repository - Source of active portal observations.
   */
  constructor(private readonly repository: PortalMonitoringRepository) {}

  /**
   * Resolves the current monitoring snapshot.
   *
   * @returns The immutable aggregate and its underlying portal observations.
   * @throws {PortalMonitoringFailure} When the repository cannot be queried.
   */
  async execute(): Promise<PortalMonitoringSnapshot> {
    try {
      return summarizePortalMonitoring(await this.repository.listActivePortalStatuses());
    } catch (cause: unknown) {
      if (cause instanceof PortalMonitoringFailure) throw cause;
      throw new PortalMonitoringFailure(
        "PORTAL_MONITORING_REPOSITORY_UNAVAILABLE",
        "No se pudo consultar el estado de los portales.",
        { cause },
      );
    }
  }
}
