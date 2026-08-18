import {
  KontaveRemoteClient,
  RemoteProfilePort,
} from "@kontave/client-remote";
import type { DesktopCurrentUserState } from "../../shared/desktop-api";
import type { DesktopAuthenticatedRequest } from "../auth/desktop-authenticated-request";

/** Desktop composition adapter for the portable current-user remote port. */
export class DesktopCurrentUserSource {
  private readonly profile: RemoteProfilePort;

  /**
   * Creates the source using Desktop's authenticated request mechanism.
   * @param baseUrl - Kontave API origin.
   * @param request - Desktop session-aware request adapter.
   */
  constructor(baseUrl: string, request: DesktopAuthenticatedRequest) {
    this.profile = new RemoteProfilePort(
      new KontaveRemoteClient({
        baseUrl,
        platform: "desktop",
        authenticatedRequest: (input, init) => request.fetch(input, init),
      }),
    );
  }

  /** @returns Current profile mapped to Desktop presentation state. */
  async getCurrent(): Promise<DesktopCurrentUserState> {
    return { status: "ready", user: await this.profile.current() };
  }
}
