import type {
  AuthenticatedDeviceSessionDto,
  AuthenticationPort,
  ChangePasswordDto,
} from "@kontave/client-contracts";
import type { RemoteTransport } from "../../transport";
import { array, decodeRemote } from "../../decoding";
import { session, changed, revoked } from "./decoding";

/** Remote adapter for authenticated device-session administration. */
export class RemoteAuthenticationPort implements AuthenticationPort {
  /**
   * Creates the adapter.
   * @param transport - Authenticated Client API transport.
   */
  constructor(private readonly transport: RemoteTransport) {}

  /** @returns All device sessions belonging to the current user.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  sessions(): Promise<readonly AuthenticatedDeviceSessionDto[]> {
    return decodeRemote(
      this.transport,
      "/api/client/v1/auth/sessions",
      { method: "GET" },
      (value) => array(value, session),
    );
  }

  /**
   * Changes the current user's password.
   * @param command - New password and optional session revocation policy.
   * @returns Confirmation returned by the API.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  changePassword(
    command: ChangePasswordDto,
  ): Promise<{ readonly changed: boolean }> {
    return decodeRemote(
      this.transport,
      "/api/client/v1/auth/change-password",
      json("POST", command),
      changed,
    );
  }

  /**
   * Revokes one authenticated device session.
   * @param sessionId - Session identifier to revoke.
   * @returns Confirmation returned by the API.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  revokeSession(sessionId: string): Promise<{ readonly revoked: boolean }> {
    return decodeRemote(
      this.transport,
      `/api/client/v1/auth/sessions/${segment(sessionId)}`,
      { method: "DELETE" },
      revoked,
    );
  }

  /** @returns Confirmation after revoking every session except the current one.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  revokeOtherSessions(): Promise<{ readonly revoked: boolean }> {
    return decodeRemote(
      this.transport,
      "/api/client/v1/auth/sessions",
      { method: "DELETE" },
      revoked,
    );
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
