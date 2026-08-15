import {
  AccessTokenRejectedFailure,
  NativeSessionRefreshCoordinator,
} from "@kontave/auth-application";

/** HTTP adapter for the protocol-neutral native session coordinator. */
export class DesktopAuthenticatedRequest {
  constructor(private readonly sessions: NativeSessionRefreshCoordinator) {}

  fetch(input: URL | string, init?: RequestInit): Promise<Response> {
    return this.sessions.execute(async (accessToken) => {
      const headers = new Headers(init?.headers);
      headers.set("authorization", `Bearer ${accessToken}`);
      headers.set("x-kontave-client", "desktop");
      const response = await fetch(input, { ...init, headers });
      if (response.status === 401) throw new AccessTokenRejectedFailure();
      return response;
    });
  }
}
