import { portalMonitoring } from "./decoding";
import { decodeRemote } from "../../decoding";
import type {
  PortalMonitoringDto,
  PortalMonitoringPort,
} from "@kontave/client-contracts";
import type { RemoteTransport } from "../../transport";

/** Remote adapter for monitored government-platform availability. */
export class RemotePortalMonitoringPort implements PortalMonitoringPort {
  /**
   * Creates the adapter.
   * @param transport - Authenticated Client API transport.
   */
  constructor(private readonly transport: RemoteTransport) {}

  /** @returns The latest aggregate and per-portal availability snapshot.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  current(): Promise<PortalMonitoringDto> {
    return decodeRemote(
      this.transport,
      "/api/client/v1/platform/status",
      { method: "GET" },
      portalMonitoring,
    );
  }
}
