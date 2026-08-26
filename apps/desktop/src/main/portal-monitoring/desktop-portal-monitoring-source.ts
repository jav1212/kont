import type {
  ClientPortFeature,
  PortalMonitoringPort,
} from "@kontave/client-contracts";
import type { DesktopPortalMonitoringState } from "../../renderer-bridge";
import { requireClientValue } from "../client/client-operation";

/** Desktop composition adapter for portable portal-monitoring reads. */
export class DesktopPortalMonitoringSource {
  /**
   * Creates the source over the portable portal-monitoring feature.
   * @param portalMonitoring - Runtime-managed portal-monitoring feature.
   */
  constructor(
    private readonly portalMonitoring: ClientPortFeature<PortalMonitoringPort>,
  ) {}

  /** @returns Latest aggregate platform availability for Desktop presentation. */
  async getCurrent(): Promise<DesktopPortalMonitoringState> {
    const snapshot = requireClientValue(await this.portalMonitoring.current());
    return {
      status: "ready",
      availability: snapshot.status,
      observedAt: snapshot.observedAt,
    };
  }
}
