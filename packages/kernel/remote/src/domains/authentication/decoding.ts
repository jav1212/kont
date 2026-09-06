import type { AuthenticatedDeviceSessionDto } from "@kontave/client-contracts";
import type { Decoder } from "../../decoding";
import {
  shape,
  textField,
  literal,
  nullOr,
  booleanField,
  responseDto,
} from "../../response-shape";

/**
 * Validates a device-session response before exposing it through authentication ports.
 * @param value - Untrusted session data.
 * @returns The complete session or null when any field is malformed.
 */
export const session: Decoder<AuthenticatedDeviceSessionDto> = responseDto(
  shape<AuthenticatedDeviceSessionDto>({
    id: textField,
    client: literal("web", "desktop", "mobile"),
    deviceName: nullOr(textField),
    operatingSystem: nullOr(textField),
    createdAt: textField,
    lastSeenAt: textField,
    current: booleanField,
  }),
);

/**
 * Validates password-change confirmation without interpreting truthiness.
 * @param value - Untrusted response data.
 * @returns The boolean confirmation or null for a malformed response.
 */
export const changed: Decoder<{ readonly changed: boolean }> = responseDto(
  shape({ changed: booleanField }),
);

/**
 * Validates session-revocation confirmation without interpreting truthiness.
 * @param value - Untrusted response data.
 * @returns The boolean confirmation or null for a malformed response.
 */
export const revoked: Decoder<{ readonly revoked: boolean }> = responseDto(
  shape({ revoked: booleanField }),
);
