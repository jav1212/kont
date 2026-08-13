import {
  currency,
  exchangeRate,
  moneyFromDecimal,
  type CurrencyDefinition,
  type ExchangeRate,
  type Money,
} from "@kontave/monetary-domain";

export const VES: CurrencyDefinition = currency("VES", 2);
export const USD: CurrencyDefinition = currency("USD", 2);
export const EUR: CurrencyDefinition = currency("EUR", 2);

export function ves(value: string): Money { return moneyFromDecimal(value, VES); }
export function usd(value: string): Money { return moneyFromDecimal(value, USD); }
export function eur(value: string): Money { return moneyFromDecimal(value, EUR); }

export function usdToVes(value: string): ExchangeRate {
  return exchangeRate({ baseCurrency: USD, quoteCurrency: VES, value });
}

export function eurToVes(value: string): ExchangeRate {
  return exchangeRate({ baseCurrency: EUR, quoteCurrency: VES, value });
}
