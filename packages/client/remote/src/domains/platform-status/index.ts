import type {
  PlatformStatusDto,
  PlatformStatusPort,
} from "@kontave/client-contracts";
import type { RemoteTransport } from "../../transport";

/** Remote adapter for monitored government-platform availability. */
export class RemotePlatformStatusPort implements PlatformStatusPort {
  /**
   * Creates the adapter.
   * @param transport - Authenticated Client API transport.
   */
  constructor(private readonly transport: RemoteTransport) {}

  /** @returns The latest aggregate and per-portal availability snapshot. */
  current(): Promise<PlatformStatusDto> {
    return this.transport.get("/api/client/v1/platform/status");
  }
}
