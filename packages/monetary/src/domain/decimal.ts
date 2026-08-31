import { Decimal as DecimalJs } from "decimal.js";
import { MonetaryFailure } from "./failure";

declare const exactDecimalBrand: unique symbol;
export type ExactDecimal = string & { readonly [exactDecimalBrand]: true };

export type RoundingMode =
  | "up"
  | "down"
  | "ceiling"
  | "floor"
  | "half_up"
  | "half_down"
  | "half_even"
  | "half_ceiling"
  | "half_floor";

export interface QuantizationPolicy {
  readonly scale: number;
  readonly mode: RoundingMode;
}

// A private constructor prevents another package from changing decimal.js global settings.
const Decimal = DecimalJs.clone({ precision: 80, rounding: DecimalJs.ROUND_HALF_UP });
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Parses a finite base-10 decimal without binary floating-point conversion.
 * @param value - Decimal text without exponent notation.
 * @returns Canonical exact decimal text.
 * @throws {MonetaryFailure} When the value is invalid or non-finite.
 */
export function exactDecimal(value: string): ExactDecimal {
  const candidate = value.trim();
  if (!DECIMAL_PATTERN.test(candidate)) {
    throw new MonetaryFailure("INVALID_DECIMAL", `Invalid decimal value: ${value}`);
  }
  const parsed = new Decimal(candidate);
  if (!parsed.isFinite()) throw new MonetaryFailure("INVALID_DECIMAL", `Invalid decimal value: ${value}`);
  return canonical(parsed);
}

/**
 * Adds two exact decimals.
 * @param left - Left operand.
 * @param right - Right operand.
 * @returns Their exact canonical sum.
 */
export function addDecimal(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  return canonical(parse(left).plus(parse(right)));
}

/**
 * Subtracts two exact decimals.
 * @param left - Minuend.
 * @param right - Subtrahend.
 * @returns Their exact canonical difference.
 */
export function subtractDecimal(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  return canonical(parse(left).minus(parse(right)));
}

/**
 * Multiplies two exact decimals.
 * @param left - Left factor.
 * @param right - Right factor.
 * @returns Their exact canonical product.
 */
export function multiplyDecimal(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  return canonical(parse(left).times(parse(right)));
}

/**
 * Divides two decimals under the private 80-digit precision policy.
 * @param left - Dividend.
 * @param right - Divisor.
 * @returns The canonical quotient.
 * @throws {MonetaryFailure} When dividing by zero.
 */
export function divideDecimal(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  if (parse(right).isZero()) throw new MonetaryFailure("DIVISION_BY_ZERO", "Cannot divide a monetary decimal by zero.");
  return canonical(parse(left).dividedBy(parse(right)));
}

/**
 * Negates an exact decimal.
 * @param value - Decimal to negate.
 * @returns Its canonical additive inverse.
 */
export function negateDecimal(value: ExactDecimal): ExactDecimal {
  return canonical(parse(value).negated());
}

/**
 * Compares two exact decimals.
 * @param left - Left operand.
 * @param right - Right operand.
 * @returns `-1`, `0` or `1` according to numeric ordering.
 */
export function compareDecimal(left: ExactDecimal, right: ExactDecimal): -1 | 0 | 1 {
  const comparison = parse(left).comparedTo(parse(right));
  return comparison < 0 ? -1 : comparison > 0 ? 1 : 0;
}

/**
 * Quantizes a decimal to an explicit scale and rounding mode.
 * @param value - Exact decimal to quantize.
 * @param policy - Target scale and rounding mode.
 * @returns Quantized canonical decimal text.
 * @throws {MonetaryFailure} When the scale is outside 0 through 100.
 */
export function quantizeDecimal(value: ExactDecimal, policy: QuantizationPolicy): ExactDecimal {
  requireScale(policy.scale);
  return exactDecimal(parse(value).toDecimalPlaces(policy.scale, roundingMode(policy.mode)).toFixed(policy.scale));
}

/**
 * Counts fractional digits in valid decimal text.
 * @param value - Decimal text to inspect.
 * @returns The number of fractional digits.
 * @throws {MonetaryFailure} When the text is invalid.
 */
export function decimalScale(value: string): number {
  const candidate = value.trim();
  if (!DECIMAL_PATTERN.test(candidate)) throw new MonetaryFailure("INVALID_DECIMAL", `Invalid decimal value: ${value}`);
  const point = candidate.indexOf(".");
  return point < 0 ? 0 : candidate.length - point - 1;
}

/**
 * Exposes exact decimal text for serialization.
 * @param value - Exact decimal.
 * @returns Its canonical string representation.
 */
export function decimalToString(value: ExactDecimal): string {
  return value;
}

/**
 * Renders an exact decimal with a fixed number of fractional digits.
 * @param value - Exact decimal to render.
 * @param scale - Required fractional digit count.
 * @returns Fixed-scale decimal text.
 * @throws {MonetaryFailure} When scale is outside 0 through 100.
 */
export function decimalToFixed(value: ExactDecimal, scale: number): string {
  requireScale(scale);
  return parse(value).toFixed(scale);
}

function parse(value: ExactDecimal): InstanceType<typeof Decimal> {
  return new Decimal(value);
}

function canonical(value: InstanceType<typeof Decimal>): ExactDecimal {
  if (!value.isFinite()) throw new MonetaryFailure("INVALID_DECIMAL", "Decimal result is not finite.");
  const decimalPlaces = value.decimalPlaces();
  return value.toFixed(decimalPlaces) as ExactDecimal;
}

function requireScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > 100) {
    throw new MonetaryFailure("INVALID_ROUNDING_SCALE", "Rounding scale must be an integer between 0 and 100.");
  }
}

function roundingMode(mode: RoundingMode): DecimalJs.Rounding {
  const modes: Readonly<Record<RoundingMode, DecimalJs.Rounding>> = {
    up: DecimalJs.ROUND_UP,
    down: DecimalJs.ROUND_DOWN,
    ceiling: DecimalJs.ROUND_CEIL,
    floor: DecimalJs.ROUND_FLOOR,
    half_up: DecimalJs.ROUND_HALF_UP,
    half_down: DecimalJs.ROUND_HALF_DOWN,
    half_even: DecimalJs.ROUND_HALF_EVEN,
    half_ceiling: DecimalJs.ROUND_HALF_CEIL,
    half_floor: DecimalJs.ROUND_HALF_FLOOR,
  };
  return modes[mode];
}
