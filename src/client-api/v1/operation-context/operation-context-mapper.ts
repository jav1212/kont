import type { OperationalDefaultsDto } from "@kontave/client-contracts";
import type { OperationalDefaults } from "@kontave/operation-context/domain";

export function toOperationalDefaultsDto(
  value: OperationalDefaults,
): OperationalDefaultsDto {
  return {
    effectiveDate: value.effectiveDate,
    presentationCurrency: value.presentationCurrency,
    exchangeRate:
      value.exchangeRate.status === "unavailable"
        ? value.exchangeRate
        : {
            status: "resolved",
            value: {
              baseCurrency: value.exchangeRate.value.rate.baseCurrency.code,
              quoteCurrency: value.exchangeRate.value.rate.quoteCurrency.code,
              value: value.exchangeRate.value.rate.value,
              effectiveDate: value.exchangeRate.value.effectiveDate,
              capturedAt: value.exchangeRate.value.capturedAt,
              source: value.exchangeRate.value.source,
            },
          },
    version: value.version,
    updatedAt: value.updatedAt,
  };
}
