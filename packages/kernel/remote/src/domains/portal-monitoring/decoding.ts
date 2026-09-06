import type {
  PortalMonitoringDto,
  PortalAvailability,
  PortalStatusDto,
} from "@kontave/client-contracts";
import type { Decoder } from "../../decoding";
import {
  textField,
  numberField,
  shape,
  list,
  nullOr,
  literal,
  responseDto,
  type ResponseField,
} from "../../response-shape";

const portalAvailabilityShape: ResponseField<PortalAvailability> = literal(
  "operational",
  "degraded",
  "down",
  "unknown",
);

const portalStatusDtoShape: ResponseField<PortalStatusDto> =
  shape<PortalStatusDto>({
    id: textField,
    slug: textField,
    name: textField,
    category: literal("fiscal", "laboral", "mercantil"),
    logoUrl: nullOr(textField),
    status: portalAvailabilityShape,
    responseTimeMs: nullOr(numberField),
    checkedAt: nullOr(textField),
  });

const portalMonitoringDtoShape: ResponseField<PortalMonitoringDto> =
  shape<PortalMonitoringDto>({
    status: portalAvailabilityShape,
    observedAt: nullOr(textField),
    summary: shape({
      operational: numberField,
      degraded: numberField,
      down: numberField,
      unknown: numberField,
      total: numberField,
    }),
    portals: list(portalStatusDtoShape),
  });

/**
 * Validates the complete PortalMonitoringDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const portalMonitoring: Decoder<PortalMonitoringDto> = responseDto(
  portalMonitoringDtoShape,
);
