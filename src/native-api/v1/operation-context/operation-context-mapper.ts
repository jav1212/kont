import type { NativeOperationalDefaultsDto } from "@kontave/native-api-contracts";
import type { OperationalDefaults } from "@kontave/operation-context-domain";

export function toNativeOperationalDefaultsDto(value: OperationalDefaults): NativeOperationalDefaultsDto {
  return {
    effectiveDate: value.effectiveDate,
    presentationCurrency: value.presentationCurrency,
    exchangeRate: value.exchangeRate.status === "unavailable"
      ? value.exchangeRate
      : { status: "resolved", value: {
        baseCurrency: value.exchangeRate.value.rate.baseCurrency.code,
        quoteCurrency: value.exchangeRate.value.rate.quoteCurrency.code,
        value: value.exchangeRate.value.rate.value,
        effectiveDate: value.exchangeRate.value.effectiveDate,
        capturedAt: value.exchangeRate.value.capturedAt,
        source: value.exchangeRate.value.source,
      } },
    version: value.version,
    updatedAt: value.updatedAt,
  };
}
