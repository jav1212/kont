import type { UserPreferences } from "@kontave/preferences-domain";
import type { NativeUserPreferencesDto } from "@kontave/native-api-contracts";

export function toNativeUserPreferencesDto(value: UserPreferences): NativeUserPreferencesDto {
  return { appearance: value.appearance, regional: value.regional, version: value.version, updatedAt: value.updatedAt };
}
