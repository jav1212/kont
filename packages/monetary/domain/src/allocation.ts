import { Decimal as DecimalJs } from "decimal.js";
import { exactDecimal, type ExactDecimal } from "./decimal.js";
import { MonetaryFailure } from "./failure.js";
import { moneyFromMinor, type Money } from "./money.js";

export type AllocationStrategy = "last_part_carry" | "largest_remainder";

export interface AllocationPart<TKey> {
  readonly key: TKey;
  readonly weight: ExactDecimal;
}

export interface MoneyAllocation<TKey> {
  readonly key: TKey;
  readonly amount: Money;
  readonly residualAdjustment: Money;
}

const Decimal = DecimalJs.clone({ precision: 80, rounding: DecimalJs.ROUND_HALF_UP });

export function allocateMoney<TKey>(input: {
  readonly total: Money;
  readonly parts: readonly AllocationPart<TKey>[];
  readonly strategy: AllocationStrategy;
}): readonly MoneyAllocation<TKey>[] {
  if (input.parts.length === 0) {
    if (input.total.minorAmount === 0n) return [];
    throw new MonetaryFailure("INVALID_ALLOCATION", "A non-zero amount requires at least one allocation part.");
  }
  const weights = input.parts.map((part) => new Decimal(part.weight));
  if (weights.some((weight) => weight.isNegative())) {
    throw new MonetaryFailure("INVALID_ALLOCATION", "Allocation weights cannot be negative.");
  }
  const weightTotal = Decimal.sum(...weights);
  if (weightTotal.isZero()) {
    throw new MonetaryFailure("INVALID_ALLOCATION", "Allocation weights must have a positive total.");
  }

  const exactShares = weights.map((weight) => new Decimal(input.total.minorAmount.toString()).times(weight).div(weightTotal));
  const baseShares = exactShares.map((share) => BigInt(share.trunc().toFixed(0)));
  let residual = input.total.minorAmount - baseShares.reduce((sum, value) => sum + value, 0n);
  const adjustments = baseShares.map(() => 0n);

  if (input.strategy === "last_part_carry") {
    const last = adjustments.length - 1;
    adjustments[last] = residual;
  } else {
    const direction = residual < 0n ? -1n : 1n;
    const ranked = exactShares
      .map((share, index) => ({ index, remainder: share.minus(share.trunc()).abs() }))
      .sort((left, right) => right.remainder.comparedTo(left.remainder) || left.index - right.index);
    let cursor = 0;
    while (residual !== 0n) {
      const target = ranked[cursor % ranked.length];
      if (target === undefined) throw new MonetaryFailure("INVALID_ALLOCATION", "Allocation ranking is empty.");
      adjustments[target.index] = (adjustments[target.index] ?? 0n) + direction;
      residual -= direction;
      cursor += 1;
    }
  }

  return input.parts.map((part, index) => {
    const adjustment = adjustments[index] ?? 0n;
    const base = baseShares[index] ?? 0n;
    return {
      key: part.key,
      amount: moneyFromMinor(base + adjustment, input.total.currency),
      residualAdjustment: moneyFromMinor(adjustment, input.total.currency),
    };
  });
}

export function allocationPart<TKey>(key: TKey, weight: string): AllocationPart<TKey> {
  return { key, weight: exactDecimal(weight) };
}
