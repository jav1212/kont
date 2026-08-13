import { exactDecimal, type ExactDecimal, type RoundingMode } from "./decimal.js";
import { MonetaryFailure } from "./failure.js";

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

export function currencyCode(value: string): CurrencyCode {
  const normalized = value.trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(normalized)) {
    throw new MonetaryFailure("INVALID_CURRENCY_CODE", `Invalid ISO-style currency code: ${value}`);
  }
  return normalized as CurrencyCode;
}

export function currency(value: string, minorUnit: number): CurrencyDefinition {
  if (!Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > 100) {
    throw new MonetaryFailure("INVALID_MINOR_UNIT", "Currency minor unit must be an integer between 0 and 100.");
  }
  return { code: currencyCode(value), minorUnit };
}

export function moneyFromMinor(minorAmount: bigint, definition: CurrencyDefinition): Money {
  return { minorAmount, currency: definition };
}

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

export function moneyToDecimal(value: Money): ExactDecimal {
  const negative = value.minorAmount < 0n;
  const absolute = negative ? -value.minorAmount : value.minorAmount;
  const factor = powerOfTen(value.currency.minorUnit);
  const whole = absolute / factor;
  const fraction = (absolute % factor).toString().padStart(value.currency.minorUnit, "0");
  const rendered = value.currency.minorUnit === 0 ? whole.toString() : `${whole}.${fraction}`;
  return exactDecimal(negative ? `-${rendered}` : rendered);
}

export function quantizeMoney(value: ExactDecimal, definition: CurrencyDefinition, mode: RoundingMode): Money {
  const Decimal = decimalParts(value);
  const quantized = Decimal.toDecimalPlaces(definition.minorUnit, decimalRounding(mode)).toFixed(definition.minorUnit);
  return moneyFromDecimal(quantized, definition);
}

export function addMoney(left: Money, right: Money): Money {
  requireSameCurrency(left, right);
  return moneyFromMinor(left.minorAmount + right.minorAmount, left.currency);
}

export function subtractMoney(left: Money, right: Money): Money {
  requireSameCurrency(left, right);
  return moneyFromMinor(left.minorAmount - right.minorAmount, left.currency);
}

export function negateMoney(value: Money): Money {
  return moneyFromMinor(-value.minorAmount, value.currency);
}

export function compareMoney(left: Money, right: Money): -1 | 0 | 1 {
  requireSameCurrency(left, right);
  return left.minorAmount < right.minorAmount ? -1 : left.minorAmount > right.minorAmount ? 1 : 0;
}

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
