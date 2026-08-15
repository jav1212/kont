import {
  AccessTokenRejectedFailure,
  NativeSessionRefreshCoordinator,
} from "@kontave/auth-application";

/** Adds native-client credentials and delegates 401 recovery to the shared coordinator. */
export class MobileAuthenticatedRequest {
  constructor(private readonly sessions: NativeSessionRefreshCoordinator) {}

  fetch(input: URL | string, init?: RequestInit): Promise<Response> {
    return this.sessions.execute(async (accessToken) => {
      const headers = new Headers(init?.headers);
      headers.set("authorization", `Bearer ${accessToken}`);
      headers.set("x-kontave-client", "mobile");
      const response = await fetch(input, { ...init, headers });
      if (response.status === 401) throw new AccessTokenRejectedFailure();
      return response;
    });
  }
}
