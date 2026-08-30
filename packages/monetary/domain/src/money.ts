import { exactDecimal, type ExactDecimal, type RoundingMode } from "./decimal";
import { MonetaryFailure } from "./failure";

declare const currencyCodeBrand: unique symbol;
export type CurrencyCode = string & { readonly [currencyCodeBrand]: true };

export interface CurrencyDefinition {
  readonly code: CurrencyCode;
  readonly minorUnit: number;
}

export interface Money {
  readonly minorAmount: bigint;
  readonly currency: CurrencyDefinition;
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * Normalizes and brands an ISO-style three-letter currency code.
 * @param value - Untrusted currency code.
 * @returns The uppercase branded code.
 * @throws {MonetaryFailure} When the code is not exactly three ASCII letters.
 */
export function currencyCode(value: string): CurrencyCode {
  const normalized = value.trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(normalized)) {
    throw new MonetaryFailure("INVALID_CURRENCY_CODE", `Invalid ISO-style currency code: ${value}`);
  }
  return normalized as CurrencyCode;
}

/**
 * Creates a currency definition.
 * @param value - ISO-style currency code.
 * @param minorUnit - Supported fractional digit count from 0 through 100.
 * @returns The validated currency definition.
 * @throws {MonetaryFailure} When code or minor unit is invalid.
 */
export function currency(value: string, minorUnit: number): CurrencyDefinition {
  if (!Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > 100) {
    throw new MonetaryFailure("INVALID_MINOR_UNIT", "Currency minor unit must be an integer between 0 and 100.");
  }
  return { code: currencyCode(value), minorUnit };
}

/**
 * Creates money from an exact minor-unit amount.
 * @param minorAmount - Signed integer minor units.
 * @param definition - Currency definition.
 * @returns The exact money value.
 */
export function moneyFromMinor(minorAmount: bigint, definition: CurrencyDefinition): Money {
  return { minorAmount, currency: definition };
}

/**
 * Parses decimal money without rounding.
 * @param value - Exact decimal amount.
 * @param definition - Currency and supported minor-unit scale.
 * @returns The exact minor-unit money value.
 * @throws {MonetaryFailure} When invalid or more precise than the currency permits.
 */
export function moneyFromDecimal(value: string, definition: CurrencyDefinition): Money {
  const parsed = exactDecimal(value);
  const [wholePart = "0", fractionPart = ""] = parsed.split(".");
  if (fractionPart.length > definition.minorUnit) {
    throw new MonetaryFailure(
      "INVALID_DECIMAL",
      `${value} exceeds the ${definition.minorUnit} minor-unit digits supported by ${definition.code}.`,
    );
  }
  const negative = wholePart.startsWith("-");
  const unsignedWhole = wholePart.replace(/^[+-]/, "");
  const paddedFraction = fractionPart.padEnd(definition.minorUnit, "0");
  const absoluteMinor = BigInt(unsignedWhole || "0") * powerOfTen(definition.minorUnit) + BigInt(paddedFraction || "0");
  return moneyFromMinor(negative ? -absoluteMinor : absoluteMinor, definition);
}

/**
 * Converts money to exact fixed-scale decimal text.
 * @param value - Money value to serialize.
 * @returns Exact decimal text at the currency's minor-unit scale.
 */
export function moneyToDecimal(value: Money): ExactDecimal {
  const negative = value.minorAmount < 0n;
  const absolute = negative ? -value.minorAmount : value.minorAmount;
  const factor = powerOfTen(value.currency.minorUnit);
  const whole = absolute / factor;
  const fraction = (absolute % factor).toString().padStart(value.currency.minorUnit, "0");
  const rendered = value.currency.minorUnit === 0 ? whole.toString() : `${whole}.${fraction}`;
  return exactDecimal(negative ? `-${rendered}` : rendered);
}

/**
 * Rounds an exact decimal to a currency's minor-unit scale.
 * @param value - Decimal amount to quantize.
 * @param definition - Target currency definition.
 * @param mode - Explicit rounding mode.
 * @returns Quantized money.
 */
export function quantizeMoney(value: ExactDecimal, definition: CurrencyDefinition, mode: RoundingMode): Money {
  const Decimal = decimalParts(value);
  const quantized = Decimal.toDecimalPlaces(definition.minorUnit, decimalRounding(mode)).toFixed(definition.minorUnit);
  return moneyFromDecimal(quantized, definition);
}

/**
 * Adds money in the same currency definition.
 * @param left - Left amount.
 * @param right - Right amount.
 * @returns Their exact sum.
 * @throws {MonetaryFailure} When currencies differ.
 */
export function addMoney(left: Money, right: Money): Money {
  requireSameCurrency(left, right);
  return moneyFromMinor(left.minorAmount + right.minorAmount, left.currency);
}

/**
 * Subtracts money in the same currency definition.
 * @param left - Minuend.
 * @param right - Subtrahend.
 * @returns Their exact difference.
 * @throws {MonetaryFailure} When currencies differ.
 */
export function subtractMoney(left: Money, right: Money): Money {
  requireSameCurrency(left, right);
  return moneyFromMinor(left.minorAmount - right.minorAmount, left.currency);
}

/**
 * Negates a money value.
 * @param value - Money to negate.
 * @returns Its additive inverse in the same currency.
 */
export function negateMoney(value: Money): Money {
  return moneyFromMinor(-value.minorAmount, value.currency);
}

/**
 * Compares money in the same currency definition.
 * @param left - Left amount.
 * @param right - Right amount.
 * @returns `-1`, `0` or `1` according to numeric ordering.
 * @throws {MonetaryFailure} When currencies differ.
 */
export function compareMoney(left: Money, right: Money): -1 | 0 | 1 {
  requireSameCurrency(left, right);
  return left.minorAmount < right.minorAmount ? -1 : left.minorAmount > right.minorAmount ? 1 : 0;
}

/**
 * Compares both code and minor-unit scale of currency definitions.
 * @param left - Left definition.
 * @param right - Right definition.
 * @returns Whether both definitions are identical.
 */
export function sameCurrency(left: CurrencyDefinition, right: CurrencyDefinition): boolean {
  return left.code === right.code && left.minorUnit === right.minorUnit;
}

function requireSameCurrency(left: Money, right: Money): void {
  if (!sameCurrency(left.currency, right.currency)) {
    throw new MonetaryFailure("CURRENCY_MISMATCH", `Cannot combine ${left.currency.code} and ${right.currency.code}.`);
  }
}

function powerOfTen(scale: number): bigint {
  return 10n ** BigInt(scale);
}

// Kept private so decimal.js never becomes part of the public monetary API.
import { Decimal as DecimalJs } from "decimal.js";
const InternalDecimal = DecimalJs.clone({ precision: 80, rounding: DecimalJs.ROUND_HALF_UP });
function decimalParts(value: ExactDecimal): InstanceType<typeof InternalDecimal> { return new InternalDecimal(value); }
function decimalRounding(mode: RoundingMode): DecimalJs.Rounding {
  return {
    up: DecimalJs.ROUND_UP, down: DecimalJs.ROUND_DOWN, ceiling: DecimalJs.ROUND_CEIL,
    floor: DecimalJs.ROUND_FLOOR, half_up: DecimalJs.ROUND_HALF_UP, half_down: DecimalJs.ROUND_HALF_DOWN,
    half_even: DecimalJs.ROUND_HALF_EVEN, half_ceiling: DecimalJs.ROUND_HALF_CEIL,
    half_floor: DecimalJs.ROUND_HALF_FLOOR,
  }[mode];
}
