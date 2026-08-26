import type {
  ClientPortFeature,
  PlatformStatusPort,
} from "@kontave/client-contracts";
import type { DesktopPlatformStatusState } from "../../renderer-bridge";
import { requireClientValue } from "../client/client-operation";

/** Desktop composition adapter for portable platform-status reads. */
export class DesktopPlatformStatusSource {
  /**
   * Creates the source over the portable platform-status feature.
   * @param platformStatus - Runtime-managed platform-status feature.
   */
  constructor(
    private readonly platformStatus: ClientPortFeature<PlatformStatusPort>,
  ) {}

  /** @returns Latest aggregate platform availability for Desktop presentation. */
  async getCurrent(): Promise<DesktopPlatformStatusState> {
    const snapshot = requireClientValue(await this.platformStatus.current());
    return {
      status: "ready",
      availability: snapshot.status,
      observedAt: snapshot.observedAt,
    };
  }
}
