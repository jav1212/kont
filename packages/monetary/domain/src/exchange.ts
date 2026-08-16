import { decimalScale, exactDecimal, multiplyDecimal, type ExactDecimal, type RoundingMode } from "./decimal";
import { MonetaryFailure } from "./failure";
import { moneyToDecimal, quantizeMoney, sameCurrency, subtractMoney, type CurrencyDefinition, type Money } from "./money";

export interface ExchangeRate {
  readonly baseCurrency: CurrencyDefinition;
  readonly quoteCurrency: CurrencyDefinition;
  readonly value: ExactDecimal;
  readonly publishedScale: number;
}

export type ExchangeRateSource =
  | { readonly kind: "official"; readonly authority: string; readonly reference: string | null }
  | { readonly kind: "manual"; readonly reason: string };

export interface ExchangeRateSnapshot {
  readonly rate: ExchangeRate;
  readonly effectiveDate: string;
  readonly capturedAt: string;
  readonly source: ExchangeRateSource;
}

export interface MoneyConversion {
  readonly source: Money;
  readonly rate: ExchangeRate;
  readonly exactAmount: ExactDecimal;
  readonly converted: Money;
  readonly roundingMode: RoundingMode;
}

export function exchangeRate(input: {
  readonly baseCurrency: CurrencyDefinition;
  readonly quoteCurrency: CurrencyDefinition;
  readonly value: string;
}): ExchangeRate {
  const value = exactDecimal(input.value);
  if (value.startsWith("-") || value === "0") {
    throw new MonetaryFailure("INVALID_EXCHANGE_RATE", "Exchange rate must be greater than zero.");
  }
  if (sameCurrency(input.baseCurrency, input.quoteCurrency)) {
    throw new MonetaryFailure("INVALID_EXCHANGE_RATE", "Exchange rate currencies must be different.");
  }
  return { ...input, value, publishedScale: decimalScale(input.value) };
}

export function convertMoney(input: {
  readonly amount: Money;
  readonly rate: ExchangeRate;
  readonly roundingMode: RoundingMode;
}): MoneyConversion {
  if (!sameCurrency(input.amount.currency, input.rate.baseCurrency)) {
    throw new MonetaryFailure(
      "EXCHANGE_RATE_DIRECTION_MISMATCH",
      `Rate ${input.rate.baseCurrency.code}/${input.rate.quoteCurrency.code} cannot convert ${input.amount.currency.code}.`,
    );
  }
  const exactAmount = multiplyDecimal(moneyToDecimal(input.amount), input.rate.value);
  return {
    source: input.amount,
    rate: input.rate,
    exactAmount,
    converted: quantizeMoney(exactAmount, input.rate.quoteCurrency, input.roundingMode),
    roundingMode: input.roundingMode,
  };
}

export function calculateExchangeDifference(input: {
  readonly foreignAmount: Money;
  readonly recognitionRate: ExchangeRate;
  readonly settlementRate: ExchangeRate;
  readonly roundingMode: RoundingMode;
}): ExchangeDifference {
  const recognized = convertMoney({ amount: input.foreignAmount, rate: input.recognitionRate, roundingMode: input.roundingMode });
  const settled = convertMoney({ amount: input.foreignAmount, rate: input.settlementRate, roundingMode: input.roundingMode });
  if (!sameCurrency(recognized.converted.currency, settled.converted.currency)) {
    throw new MonetaryFailure("CURRENCY_MISMATCH", "Recognition and settlement rates must have the same quote currency.");
  }
  const amount = subtractMoney(settled.converted, recognized.converted);
  return {
    kind: amount.minorAmount > 0n ? "gain" : amount.minorAmount < 0n ? "loss" : "none",
    amount,
    recognized: recognized.converted,
    settled: settled.converted,
  };
}

export interface ExchangeDifference {
  readonly kind: "gain" | "loss" | "none";
  readonly amount: Money;
  readonly recognized: Money;
  readonly settled: Money;
}
