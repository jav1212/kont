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

/**
 * Applies an exact percentage to money without quantizing the intermediate result.
 * @param amount - Monetary base.
 * @param ratePercent - Exact percentage, where `100` represents the full amount.
 * @returns Exact money in the base currency.
 * @throws {VenezuelanPayrollFailure} When the percentage is negative.
 */
export function percentageOf(amount: Money, ratePercent: ExactDecimal): Money {
  requireNonNegativeMoney(amount);
  requireNonNegativeDecimal(ratePercent, "rate");
  return quantizeMoney(multiplyDecimal(moneyToDecimal(amount), divideDecimal(ratePercent, exactDecimal("100"))), amount.currency, "half_up");
}

/**
 * Multiplies money by an exact non-negative factor.
 * @param amount - Monetary value to scale.
 * @param factor - Exact multiplier.
 * @returns Exact money in the original currency.
 * @throws {VenezuelanPayrollFailure} When the factor is negative.
 */
export function multiplyMoney(amount: Money, factor: ExactDecimal): Money {
  requireNonNegativeMoney(amount);
  requireNonNegativeDecimal(factor, "factor");
  return quantizeMoney(multiplyDecimal(moneyToDecimal(amount), factor), amount.currency, "half_up");
}

/**
 * Selects the lower of two amounts in the same currency.
 * @param left - First money value.
 * @param right - Second money value.
 * @returns The lower value.
 * @throws {VenezuelanPayrollFailure} When currencies differ.
 */
export function minimumMoney(left: Money, right: Money): Money {
  requireSameCurrency(left, right);
  return compareDecimal(moneyToDecimal(left), moneyToDecimal(right)) <= 0 ? left : right;
}

/**
 * Selects the greater of two amounts in the same currency.
 * @param left - First money value.
 * @param right - Second money value.
 * @returns The greater value.
 * @throws {VenezuelanPayrollFailure} When currencies differ.
 */
export function maximumMoney(left: Money, right: Money): Money {
  requireSameCurrency(left, right);
  return compareDecimal(moneyToDecimal(left), moneyToDecimal(right)) >= 0 ? left : right;
}

/**
 * Asserts that a money value is non-negative.
 * @param value - Money value to validate.
 * @returns Nothing when valid.
 * @throws {VenezuelanPayrollFailure} When the value is negative.
 */
export function requireNonNegativeMoney(value: Money): void {
  if (value.minorAmount < 0n) throw new VenezuelanPayrollFailure("VE_PAYROLL_INVALID_INPUT", "Money input cannot be negative.");
}
/**
 * Asserts that an exact decimal is non-negative.
 * @param value - Exact decimal to validate.
 * @param name - Business field name used in the diagnostic.
 * @returns Nothing when valid.
 * @throws {VenezuelanPayrollFailure} When the value is negative.
 */
export function requireNonNegativeDecimal(value: ExactDecimal, name: string): void {
  if (compareDecimal(value, exactDecimal("0")) < 0) throw new VenezuelanPayrollFailure("VE_PAYROLL_INVALID_INPUT", `${name} cannot be negative.`);
}
function requireSameCurrency(left: Money, right: Money): void {
  if (!sameCurrency(left.currency, right.currency)) throw new VenezuelanPayrollFailure("VE_PAYROLL_CURRENCY_MISMATCH", "Money inputs use different currencies.");
}
