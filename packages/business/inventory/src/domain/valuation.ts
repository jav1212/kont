import type { CompanyId } from "@kontave/companies/domain";
import type { CurrencyDefinition, ExactDecimal, Money } from "@kontave/monetary/domain";
import {
  addMoney,
  compareMoney,
  divideDecimal,
  moneyFromMinor,
  moneyToDecimal,
  multiplyDecimal,
  negateMoney,
  quantizeMoney,
  sameCurrency,
  subtractMoney,
} from "@kontave/monetary/domain";
import type { ProductId, UnitOfMeasure } from "@kontave/products/domain";
import type { InventoryLocationId, StockEffectId, StockLotId } from "./identifiers";
import { InventoryFailure } from "./inventory-failure";
import type { StockEffect } from "./operation";
import {
  absoluteQuantity,
  addQuantity,
  compareQuantity,
  isNegativeQuantity,
  isPositiveQuantity,
  isZeroQuantity,
  type Quantity,
} from "./quantity";

export interface UnitCost {
  readonly amount: ExactDecimal;
  readonly currency: CurrencyDefinition;
  readonly perUnit: UnitOfMeasure;
}

export type ValuationBasis = "acquisition_cost" | "weighted_average";

export interface ValuationEffect {
  readonly stockEffectId: StockEffectId;
  readonly method: "weighted_average";
  readonly unitCost: UnitCost;
  readonly valueDelta: Money;
  readonly basis: ValuationBasis;
}

export interface ValuationPositionState {
  readonly companyId: CompanyId;
  readonly productId: ProductId;
  readonly locationId: InventoryLocationId;
  readonly lotId: StockLotId | null;
  readonly quantity: Quantity;
  readonly totalValue: Money;
  readonly averageUnitCost: UnitCost | null;
  readonly version: number;
}

export interface ValuationApplication {
  readonly position: ValuationPosition;
  readonly effect: ValuationEffect;
}

/** Weighted-average valuation position for one exact stock tuple. */
export class ValuationPosition {
  readonly companyId: CompanyId;
  readonly productId: ProductId;
  readonly locationId: InventoryLocationId;
  readonly lotId: StockLotId | null;
  readonly quantity: Quantity;
  readonly totalValue: Money;
  readonly averageUnitCost: UnitCost | null;
  readonly version: number;

  /** @param state - Complete valuation state. @throws {InventoryFailure} When tuple, quantity, cost or currency is inconsistent. */
  constructor(state: ValuationPositionState) {
    if (!Number.isSafeInteger(state.version) || state.version < 0 || isNegativeQuantity(state.quantity)) {
      throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Valuation position state is invalid.");
    }
    if (isZeroQuantity(state.quantity) !== (state.averageUnitCost === null)) {
      throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Zero valuation position cannot retain an average unit cost.");
    }
    if (state.averageUnitCost !== null) {
      requireCostCompatibility(state.averageUnitCost, state.quantity, state.totalValue.currency);
    }
    if (compareMoney(state.totalValue, moneyFromMinor(0n, state.totalValue.currency)) < 0) {
      throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Valuation position cannot have negative value.");
    }
    this.companyId = state.companyId;
    this.productId = state.productId;
    this.locationId = state.locationId;
    this.lotId = state.lotId;
    this.quantity = { ...state.quantity };
    this.totalValue = state.totalValue;
    this.averageUnitCost = state.averageUnitCost;
    this.version = state.version;
  }

  /** @param effect - Inbound stock effect. @param acquisitionValue - Total acquisition value. @returns Updated position and valuation effect. @throws {InventoryFailure} When direction, tuple or currency is invalid. */
  applyReceipt(effect: StockEffect, acquisitionValue: Money): ValuationApplication {
    this.requireMatchingEffect(effect);
    if (!isPositiveQuantity(effect.quantity) || acquisitionValue.minorAmount < 0n) {
      throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Receipt valuation requires positive quantity and non-negative value.");
    }
    if (!sameCurrency(this.totalValue.currency, acquisitionValue.currency)) {
      throw new InventoryFailure("INVENTORY_CURRENCY_MISMATCH", "Receipt value differs from the functional currency.");
    }
    const nextQuantity = addQuantity(this.quantity, effect.quantity);
    const nextValue = addMoney(this.totalValue, acquisitionValue);
    const averageUnitCost = unitCostFromTotal(nextValue, nextQuantity);
    return {
      position: new ValuationPosition({ ...this, quantity: nextQuantity, totalValue: nextValue, averageUnitCost, version: this.version + 1 }),
      effect: {
        stockEffectId: effect.id,
        method: "weighted_average",
        unitCost: unitCostFromTotal(acquisitionValue, effect.quantity),
        valueDelta: acquisitionValue,
        basis: "acquisition_cost",
      },
    };
  }

  /** @param effect - Outbound stock effect. @returns Updated position and weighted-average valuation effect. @throws {InventoryFailure} When direction, tuple or stock constraints fail. */
  applyIssue(effect: StockEffect): ValuationApplication {
    this.requireMatchingEffect(effect);
    if (!isNegativeQuantity(effect.quantity) || this.averageUnitCost === null) {
      throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Issue valuation requires available valued stock.");
    }
    const requested = absoluteQuantity(effect.quantity);
    if (compareQuantity(requested, this.quantity) > 0) {
      throw new InventoryFailure("INVENTORY_NEGATIVE_STOCK", "Issue quantity exceeds the valued stock position.");
    }
    const nextQuantity = addQuantity(this.quantity, effect.quantity);
    const issuedValue = isZeroQuantity(nextQuantity)
      ? this.totalValue
      : quantizeMoney(multiplyDecimal(requested.amount, this.averageUnitCost.amount), this.totalValue.currency, "half_up");
    const nextValue = subtractMoney(this.totalValue, issuedValue);
    return {
      position: new ValuationPosition({
        ...this,
        quantity: nextQuantity,
        totalValue: nextValue,
        averageUnitCost: isZeroQuantity(nextQuantity) ? null : this.averageUnitCost,
        version: this.version + 1,
      }),
      effect: {
        stockEffectId: effect.id,
        method: "weighted_average",
        unitCost: this.averageUnitCost,
        valueDelta: negateMoney(issuedValue),
        basis: "weighted_average",
      },
    };
  }

  private requireMatchingEffect(effect: StockEffect): void {
    if (effect.productId !== this.productId || effect.locationId !== this.locationId || effect.lotId !== this.lotId || effect.quantity.unit !== this.quantity.unit) {
      throw new InventoryFailure("INVENTORY_POSITION_MISMATCH", "Stock effect does not match the valuation position.");
    }
  }
}

/**
 * Creates a zero-quantity valuation position for a stock tuple.
 * @param input - Company, product, location, optional lot, unit and currency.
 * @returns An empty weighted-average position.
 */
export function emptyValuationPosition(input: {
  readonly companyId: CompanyId;
  readonly productId: ProductId;
  readonly locationId: InventoryLocationId;
  readonly lotId: StockLotId | null;
  readonly quantity: Quantity;
  readonly functionalCurrency: CurrencyDefinition;
}): ValuationPosition {
  if (!isZeroQuantity(input.quantity)) {
    throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "An empty valuation position requires zero quantity.");
  }
  return new ValuationPosition({
    companyId: input.companyId,
    productId: input.productId,
    locationId: input.locationId,
    lotId: input.lotId,
    quantity: input.quantity,
    totalValue: moneyFromMinor(0n, input.functionalCurrency),
    averageUnitCost: null,
    version: 0,
  });
}

function unitCostFromTotal(total: Money, quantity: Quantity): UnitCost {
  if (!isPositiveQuantity(quantity)) {
    throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Unit cost requires positive quantity.");
  }
  return {
    amount: divideDecimal(moneyToDecimal(total), quantity.amount),
    currency: total.currency,
    perUnit: quantity.unit,
  };
}

function requireCostCompatibility(cost: UnitCost, quantity: Quantity, currency: CurrencyDefinition): void {
  if (cost.perUnit !== quantity.unit || !sameCurrency(cost.currency, currency)) {
    throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Average unit cost is incompatible with the valuation position.");
  }
}
