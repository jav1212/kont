import type { NativeCurrentUserDto } from "@kontave/native-api-contracts";
import type { CurrentProfile } from "@kontave/profile-application";

export function toNativeCurrentUserDto(profile: CurrentProfile): NativeCurrentUserDto {
  return {
    userId: profile.userId,
    email: profile.email,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
  };
}
