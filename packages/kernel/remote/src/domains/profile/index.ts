import type {
  CurrentUserDto,
  ProfilePort,
  UpdateCurrentUserDto,
  UpdateUserPreferencesDto,
  UserPreferencesDto,
} from "@kontave/client-contracts";
import type { RemoteTransport } from "../../transport";
import { decodeRemote } from "../../decoding";
import { currentUser, preferences } from "./decoding";

/** Remote adapter for the current user's profile and preferences. */
export class RemoteProfilePort implements ProfilePort {
  /**
   * Creates the adapter.
   * @param transport - Authenticated Client API transport.
   */
  constructor(private readonly transport: RemoteTransport) {}

  /** @returns The current user's profile.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  current(): Promise<CurrentUserDto> {
    return decodeRemote(
      this.transport,
      "/api/client/v1/me",
      { method: "GET" },
      currentUser,
    );
  }

  /** @returns The current user's presentation and regional preferences.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  preferences(): Promise<UserPreferencesDto> {
    return decodeRemote(
      this.transport,
      "/api/client/v1/me/preferences",
      { method: "GET" },
      preferences,
    );
  }

  /**
   * Updates the current profile.
   * @param command - Versioned profile changes.
   * @returns The updated profile.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  update(command: UpdateCurrentUserDto): Promise<CurrentUserDto> {
    return decodeRemote(
      this.transport,
      "/api/client/v1/me",
      json(command),
      currentUser,
    );
  }

  /**
   * Updates current user preferences.
   * @param command - Versioned preference changes.
   * @returns The updated preferences.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  updatePreferences(
    command: UpdateUserPreferencesDto,
  ): Promise<UserPreferencesDto> {
    return decodeRemote(
      this.transport,
      "/api/client/v1/me/preferences",
      json(command),
      preferences,
    );
  }
}

function json(body: unknown): RequestInit {
  return {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
