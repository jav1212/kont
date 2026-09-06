import type {
  OperationalDefaultsDto,
  ExchangeRateSnapshotDto,
  ExchangeRateSetDto,
} from "@kontave/client-contracts";
import type { Decoder } from "../../decoding";
import {
  textField,
  numberField,
  shape,
  list,
  nullOr,
  literal,
  either,
  responseDto,
  type ResponseField,
} from "../../response-shape";

const exchangeRateSnapshotDtoShape: ResponseField<ExchangeRateSnapshotDto> =
  shape<ExchangeRateSnapshotDto>({
    baseCurrency: textField,
    quoteCurrency: textField,
    value: textField,
    effectiveDate: textField,
    capturedAt: textField,
    source: either(
      shape({
        kind: literal("official"),
        authority: textField,
        reference: nullOr(textField),
      }),
      shape({
        kind: literal("manual"),
        reason: textField,
      }),
    ),
  });

const operationalDefaultsDtoShape: ResponseField<OperationalDefaultsDto> =
  shape<OperationalDefaultsDto>({
    effectiveDate: textField,
    presentationCurrency: textField,
    exchangeRate: either(
      shape({
        status: literal("resolved"),
        value: exchangeRateSnapshotDtoShape,
      }),
      shape({
        status: literal("unavailable"),
        effectiveDate: textField,
      }),
    ),
    version: numberField,
    updatedAt: textField,
  });

const exchangeRateSetDtoShape: ResponseField<ExchangeRateSetDto> =
  shape<ExchangeRateSetDto>({
    requestedDate: textField,
    effectiveDate: textField,
    resolution: literal("exact_date", "previous_available_date"),
    observedAt: textField,
    rates: list(exchangeRateSnapshotDtoShape),
  });

/**
 * Validates the complete OperationalDefaultsDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const operationalDefaults: Decoder<OperationalDefaultsDto> = responseDto(
  operationalDefaultsDtoShape,
);

/**
 * Validates the complete ExchangeRateSetDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const exchangeRateSet: Decoder<ExchangeRateSetDto> = responseDto(
  exchangeRateSetDtoShape,
);
