import type { CurrentUserDto } from "@kontave/client-contracts";
import type { CurrentProfile } from "@kontave/profile/application";

export function toCurrentUserDto(profile: CurrentProfile): CurrentUserDto {
  return {
    userId: profile.userId,
    email: profile.email,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    version: profile.version,
  };
}
