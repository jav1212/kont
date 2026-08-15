import type { AuthenticatedIdentity } from "@kontave/auth-domain";

export interface ProfileDetails {
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

export interface ProfileDetailsReader {
  findByUserId(userId: string): Promise<ProfileDetails | null>;
}

export interface CurrentProfile {
  readonly userId: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

export type ProfileFailureCode = "PROFILE_DATA_INVALID" | "PROFILE_REPOSITORY_UNAVAILABLE";

export class ProfileFailure extends Error {
  constructor(
    readonly code: ProfileFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProfileFailure";
  }
}

/** Composes authentication-owned identity with optional presentation details. */
export class GetCurrentProfile {
  constructor(private readonly profiles: ProfileDetailsReader) {}

  async execute(identity: AuthenticatedIdentity): Promise<CurrentProfile> {
    const details = await this.profiles.findByUserId(identity.userId);
    return {
      userId: identity.userId,
      email: identity.email,
      displayName: details?.displayName ?? null,
      avatarUrl: details?.avatarUrl ?? null,
    };
  }
}
