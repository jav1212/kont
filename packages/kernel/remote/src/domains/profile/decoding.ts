import type {
  CurrentUserDto,
  UserPreferencesDto,
} from "@kontave/client-contracts";
import type { Decoder } from "../../decoding";
import {
  shape,
  textField,
  numberField,
  literal,
  nullOr,
  responseDto,
} from "../../response-shape";

/**
 * Validates the current-user response including explicit nullable profile fields.
 * @param value - Untrusted profile data.
 * @returns The complete profile or null when any field is malformed.
 */
export const currentUser: Decoder<CurrentUserDto> = responseDto(
  shape<CurrentUserDto>({
    userId: textField,
    email: nullOr(textField),
    displayName: nullOr(textField),
    avatarUrl: nullOr(textField),
    version: numberField,
  }),
);

/**
 * Validates nested appearance and regional preferences without imposing locale formats.
 * @param value - Untrusted preferences data.
 * @returns The complete preferences or null when any field is malformed.
 */
export const preferences: Decoder<UserPreferencesDto> = responseDto(
  shape<UserPreferencesDto>({
    appearance: shape({
      colorScheme: literal("light", "dark", "system"),
      density: literal("comfortable", "compact"),
    }),
    regional: shape({ locale: textField, timeZone: textField }),
    version: numberField,
    updatedAt: textField,
  }),
);
