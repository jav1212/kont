import {
  compareDecimal,
  divideDecimal,
  exactDecimal,
  moneyToDecimal,
  multiplyDecimal,
  quantizeMoney,
  sameCurrency,
  type ExactDecimal,
  type Money,
} from "@kontave/monetary-domain";
import { VenezuelanPayrollFailure } from "./failure";

export function percentageOf(amount: Money, ratePercent: ExactDecimal): Money {
  requireNonNegativeMoney(amount);
  requireNonNegativeDecimal(ratePercent, "rate");
  return quantizeMoney(multiplyDecimal(moneyToDecimal(amount), divideDecimal(ratePercent, exactDecimal("100"))), amount.currency, "half_up");
}

export function multiplyMoney(amount: Money, factor: ExactDecimal): Money {
  requireNonNegativeMoney(amount);
  requireNonNegativeDecimal(factor, "factor");
  return quantizeMoney(multiplyDecimal(moneyToDecimal(amount), factor), amount.currency, "half_up");
}

export function minimumMoney(left: Money, right: Money): Money {
  requireSameCurrency(left, right);
  return compareDecimal(moneyToDecimal(left), moneyToDecimal(right)) <= 0 ? left : right;
}

export function maximumMoney(left: Money, right: Money): Money {
  requireSameCurrency(left, right);
  return compareDecimal(moneyToDecimal(left), moneyToDecimal(right)) >= 0 ? left : right;
}

export function requireNonNegativeMoney(value: Money): void {
  if (value.minorAmount < 0n) throw new VenezuelanPayrollFailure("VE_PAYROLL_INVALID_INPUT", "Money input cannot be negative.");
}
export function requireNonNegativeDecimal(value: ExactDecimal, name: string): void {
  if (compareDecimal(value, exactDecimal("0")) < 0) throw new VenezuelanPayrollFailure("VE_PAYROLL_INVALID_INPUT", `${name} cannot be negative.`);
}
function requireSameCurrency(left: Money, right: Money): void {
  if (!sameCurrency(left.currency, right.currency)) throw new VenezuelanPayrollFailure("VE_PAYROLL_CURRENCY_MISMATCH", "Money inputs use different currencies.");
}
