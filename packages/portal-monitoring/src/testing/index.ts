import type { PortalMonitoringRepository } from "../application";
import type { PortalStatus } from "../domain";

/** Mutable in-memory portal repository for application tests. */
export class InMemoryPortalMonitoringRepository implements PortalMonitoringRepository {
  /**
   * Creates the test repository with an initial portal collection.
   *
   * @param portals - Observations returned by subsequent queries.
   */
  constructor(public portals: readonly PortalStatus[] = []) {}

  /**
   * Lists the configured portal observations.
   *
   * @returns The current in-memory collection.
   */
  async listActivePortalStatuses(): Promise<readonly PortalStatus[]> {
    return this.portals;
  }
}
