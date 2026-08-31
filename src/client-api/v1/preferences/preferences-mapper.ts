import type { UserPreferences } from "@kontave/preferences/domain";
import type { UserPreferencesDto } from "@kontave/client-contracts";

export function toUserPreferencesDto(
  value: UserPreferences,
): UserPreferencesDto {
  return {
    appearance: value.appearance,
    regional: value.regional,
    version: value.version,
    updatedAt: value.updatedAt,
  };
}
