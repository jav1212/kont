import {
  KontaveRemoteClient,
  RemotePlatformStatusPort,
} from "@kontave/client-remote";
import type { DesktopPlatformStatusState } from "../../shared/desktop-api";
import type { DesktopAuthenticatedRequest } from "../auth/desktop-authenticated-request";

/** Desktop composition adapter for portable platform-status reads. */
export class DesktopPlatformStatusSource {
  private readonly platformStatus: RemotePlatformStatusPort;

  /**
   * Creates the source using Desktop's authenticated request mechanism.
   * @param baseUrl - Kontave API origin.
   * @param request - Desktop session-aware request adapter.
   */
  constructor(baseUrl: string, request: DesktopAuthenticatedRequest) {
    this.platformStatus = new RemotePlatformStatusPort(
      new KontaveRemoteClient({
        baseUrl,
        platform: "desktop",
        authenticatedRequest: (input, init) => request.fetch(input, init),
      }),
    );
  }

  /** @returns Latest aggregate platform availability for Desktop presentation. */
  async getCurrent(): Promise<DesktopPlatformStatusState> {
    const snapshot = await this.platformStatus.current();
    return {
      status: "ready",
      availability: snapshot.status,
      observedAt: snapshot.observedAt,
    };
  }
}
