import { Decimal as DecimalJs } from "decimal.js";
import { MonetaryFailure } from "./failure.js";

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

export function exactDecimal(value: string): ExactDecimal {
  const candidate = value.trim();
  if (!DECIMAL_PATTERN.test(candidate)) {
    throw new MonetaryFailure("INVALID_DECIMAL", `Invalid decimal value: ${value}`);
  }
  const parsed = new Decimal(candidate);
  if (!parsed.isFinite()) throw new MonetaryFailure("INVALID_DECIMAL", `Invalid decimal value: ${value}`);
  return canonical(parsed);
}

export function addDecimal(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  return canonical(parse(left).plus(parse(right)));
}

export function subtractDecimal(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  return canonical(parse(left).minus(parse(right)));
}

export function multiplyDecimal(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  return canonical(parse(left).times(parse(right)));
}

export function divideDecimal(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  if (parse(right).isZero()) throw new MonetaryFailure("DIVISION_BY_ZERO", "Cannot divide a monetary decimal by zero.");
  return canonical(parse(left).dividedBy(parse(right)));
}

export function negateDecimal(value: ExactDecimal): ExactDecimal {
  return canonical(parse(value).negated());
}

export function compareDecimal(left: ExactDecimal, right: ExactDecimal): -1 | 0 | 1 {
  const comparison = parse(left).comparedTo(parse(right));
  return comparison < 0 ? -1 : comparison > 0 ? 1 : 0;
}

export function quantizeDecimal(value: ExactDecimal, policy: QuantizationPolicy): ExactDecimal {
  requireScale(policy.scale);
  return exactDecimal(parse(value).toDecimalPlaces(policy.scale, roundingMode(policy.mode)).toFixed(policy.scale));
}

export function decimalScale(value: string): number {
  const candidate = value.trim();
  if (!DECIMAL_PATTERN.test(candidate)) throw new MonetaryFailure("INVALID_DECIMAL", `Invalid decimal value: ${value}`);
  const point = candidate.indexOf(".");
  return point < 0 ? 0 : candidate.length - point - 1;
}

export function decimalToString(value: ExactDecimal): string {
  return value;
}

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
