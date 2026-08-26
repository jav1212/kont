import type {
  AuthenticatedDeviceSessionDto,
  AuthenticationPort,
  ChangePasswordDto,
} from "@kontave/client-contracts";
import type { RemoteTransport } from "../../transport";

/** Remote adapter for authenticated device-session administration. */
export class RemoteAuthenticationPort implements AuthenticationPort {
  /**
   * Creates the adapter.
   * @param transport - Authenticated Client API transport.
   */
  constructor(private readonly transport: RemoteTransport) {}

  /** @returns All device sessions belonging to the current user. */
  sessions(): Promise<readonly AuthenticatedDeviceSessionDto[]> {
    return this.transport.get("/api/client/v1/auth/sessions");
  }

  /**
   * Changes the current user's password.
   * @param command - New password and optional session revocation policy.
   * @returns Confirmation returned by the API.
   */
  changePassword(
    command: ChangePasswordDto,
  ): Promise<{ readonly changed: boolean }> {
    return this.transport.request(
      "/api/client/v1/auth/change-password",
      json("POST", command),
    );
  }

  /**
   * Revokes one authenticated device session.
   * @param sessionId - Session identifier to revoke.
   * @returns Confirmation returned by the API.
   */
  revokeSession(sessionId: string): Promise<{ readonly revoked: boolean }> {
    return this.transport.request(
      `/api/client/v1/auth/sessions/${segment(sessionId)}`,
      { method: "DELETE" },
    );
  }

  /** @returns Confirmation after revoking every session except the current one. */
  revokeOtherSessions(): Promise<{ readonly revoked: boolean }> {
    return this.transport.request("/api/client/v1/auth/sessions", {
      method: "DELETE",
    });
  }
}

function segment(value: string): string {
  if (!value.trim()) throw new Error("La sesión no es válida.");
  return encodeURIComponent(value);
}

function json(method: "POST", body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
