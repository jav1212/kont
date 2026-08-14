import { sameCurrency, type ExchangeRateSnapshot, type Money } from "@kontave/monetary-domain";
import { FiscalFailure } from "./fiscal-failure.js";

export interface FiscalPaymentAllocation {
  readonly key: string;
  readonly methodCode: string;
  readonly tenderedAmount: Money;
  readonly recognizedAmount: Money;
  readonly exchangeRate: ExchangeRateSnapshot | null;
}

export function fiscalPaymentAllocation(input: FiscalPaymentAllocation): FiscalPaymentAllocation {
  const key = required(input.key, 128, "payment key");
  const methodCode = required(input.methodCode, 64, "payment method").toUpperCase();
  if (input.tenderedAmount.minorAmount <= 0n || input.recognizedAmount.minorAmount <= 0n) {
    throw new FiscalFailure("FISCAL_PAYMENT_INVALID", "Fiscal payment amounts must be positive.");
  }
  const same = sameCurrency(input.tenderedAmount.currency, input.recognizedAmount.currency);
  if (same && input.exchangeRate !== null) {
    throw new FiscalFailure("FISCAL_PAYMENT_INVALID", "Same-currency fiscal payment cannot retain an exchange rate.");
  }
  if (!same && input.exchangeRate === null) {
    throw new FiscalFailure("FISCAL_PAYMENT_INVALID", "Foreign-currency fiscal payment requires an exchange-rate snapshot.");
  }
  if (input.exchangeRate !== null &&
      (!sameCurrency(input.exchangeRate.rate.baseCurrency, input.tenderedAmount.currency) ||
       !sameCurrency(input.exchangeRate.rate.quoteCurrency, input.recognizedAmount.currency))) {
    throw new FiscalFailure("FISCAL_PAYMENT_INVALID", "Fiscal payment exchange rate has an incompatible direction.");
  }
  return { ...input, key, methodCode };
}

function required(value: string, limit: number, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > limit) throw new FiscalFailure("FISCAL_PAYMENT_INVALID", `Fiscal ${name} is invalid.`);
  return normalized;
}
