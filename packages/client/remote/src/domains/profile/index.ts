import type {
  CurrentUserDto,
  ProfilePort,
  UpdateCurrentUserDto,
  UpdateUserPreferencesDto,
  UserPreferencesDto,
} from "@kontave/client-contracts";
import type { RemoteTransport } from "../../transport";

/** Remote adapter for the current user's profile and preferences. */
export class RemoteProfilePort implements ProfilePort {
  /**
   * Creates the adapter.
   * @param transport - Authenticated Client API transport.
   */
  constructor(private readonly transport: RemoteTransport) {}

  /** @returns The current user's profile. */
  current(): Promise<CurrentUserDto> {
    return this.transport.get("/api/client/v1/me");
  }

  /** @returns The current user's presentation and regional preferences. */
  preferences(): Promise<UserPreferencesDto> {
    return this.transport.get("/api/client/v1/me/preferences");
  }

  /**
   * Updates the current profile.
   * @param command - Versioned profile changes.
   * @returns The updated profile.
   */
  update(command: UpdateCurrentUserDto): Promise<CurrentUserDto> {
    return this.transport.request("/api/client/v1/me", json(command));
  }

  /**
   * Updates current user preferences.
   * @param command - Versioned preference changes.
   * @returns The updated preferences.
   */
  updatePreferences(
    command: UpdateUserPreferencesDto,
  ): Promise<UserPreferencesDto> {
    return this.transport.request(
      "/api/client/v1/me/preferences",
      json(command),
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
