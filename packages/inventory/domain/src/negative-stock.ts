import type { CompanyId } from "@kontave/companies-domain";
import type { CurrencyDefinition, Money } from "@kontave/monetary-domain";
import {
  addMoney,
  divideDecimal,
  moneyFromMinor,
  moneyToDecimal,
  multiplyDecimal,
  negateMoney,
  quantizeMoney,
  sameCurrency,
  subtractMoney,
} from "@kontave/monetary-domain";
import type { ProductId } from "@kontave/products-domain";
import type { InventoryLocationId, StockEffectId, StockLotId } from "./identifiers.js";
import { InventoryFailure } from "./inventory-failure.js";
import type { StockEffect } from "./operation.js";
import {
  absoluteQuantity,
  addQuantity,
  compareQuantity,
  isNegativeQuantity,
  isPositiveQuantity,
  isZeroQuantity,
  subtractQuantity,
  zeroQuantity,
  type Quantity,
} from "./quantity.js";
import type { UnitCost, ValuationEffect, ValuationPosition } from "./valuation.js";
import { ValuationPosition as PositiveValuationPosition } from "./valuation.js";

export interface NegativeStockExposure {
  readonly sourceEffectId: StockEffectId;
  readonly openQuantity: Quantity;
  readonly provisionalUnitCost: UnitCost;
}

export interface NegativeStockSettlement {
  readonly sourceEffectId: StockEffectId;
  readonly receiptEffectId: StockEffectId;
  readonly quantity: Quantity;
  readonly provisionalCost: Money;
  readonly actualCost: Money;
  readonly costOfIssueAdjustment: Money;
}

export interface NegativeStockPositionState {
  readonly companyId: CompanyId;
  readonly productId: ProductId;
  readonly locationId: InventoryLocationId;
  readonly lotId: StockLotId | null;
  readonly quantity: Quantity;
  readonly provisionalValue: Money;
  readonly lastKnownAverage: UnitCost;
  readonly exposures: readonly NegativeStockExposure[];
  readonly version: number;
}

export interface NegativeIssueApplication {
  readonly position: NegativeStockPosition;
  readonly effect: ValuationEffect;
}

export interface NegativeReceiptApplication {
  readonly position: ValuationPosition | NegativeStockPosition;
  readonly effect: ValuationEffect;
  readonly settlements: readonly NegativeStockSettlement[];
  readonly costOfIssueAdjustment: Money;
}

export class NegativeStockPosition {
  readonly companyId: CompanyId;
  readonly productId: ProductId;
  readonly locationId: InventoryLocationId;
  readonly lotId: StockLotId | null;
  readonly quantity: Quantity;
  readonly provisionalValue: Money;
  readonly lastKnownAverage: UnitCost;
  readonly exposures: readonly NegativeStockExposure[];
  readonly version: number;

  constructor(state: NegativeStockPositionState) {
    if (!isNegativeQuantity(state.quantity) || state.provisionalValue.minorAmount >= 0n || state.exposures.length === 0) {
      throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Negative stock position requires negative quantity, value and open exposures.");
    }
    requireCompatibleCost(state.lastKnownAverage, state.quantity, state.provisionalValue.currency);
    const exposedQuantity = state.exposures.reduce(
      (total, exposure) => addQuantity(total, exposure.openQuantity),
      zeroQuantity(state.quantity.unit),
    );
    if (compareQuantity(exposedQuantity, absoluteQuantity(state.quantity)) !== 0) {
      throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Negative stock exposures do not reconcile with the position quantity.");
    }
    for (const exposure of state.exposures) {
      if (!isPositiveQuantity(exposure.openQuantity)) {
        throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Negative stock exposure quantity must be positive.");
      }
      requireCompatibleCost(exposure.provisionalUnitCost, exposure.openQuantity, state.provisionalValue.currency);
    }
    this.companyId = state.companyId;
    this.productId = state.productId;
    this.locationId = state.locationId;
    this.lotId = state.lotId;
    this.quantity = { ...state.quantity };
    this.provisionalValue = state.provisionalValue;
    this.lastKnownAverage = state.lastKnownAverage;
    this.exposures = Object.freeze(state.exposures.map((exposure) => ({ ...exposure, openQuantity: { ...exposure.openQuantity } })));
    this.version = state.version;
  }

  static issueFrom(position: ValuationPosition, effect: StockEffect): NegativeIssueApplication {
    assertMatching(position, effect);
    if (!isNegativeQuantity(effect.quantity) || position.averageUnitCost === null) {
      throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Negative issue requires a known average unit cost.");
    }
    const requested = absoluteQuantity(effect.quantity);
    if (compareQuantity(requested, position.quantity) <= 0) {
      throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Use regular issue valuation while existing stock covers the issue.");
    }
    const uncovered = subtractQuantity(requested, position.quantity);
    const uncoveredValue = valueAt(uncovered, position.averageUnitCost);
    const totalIssuedValue = addMoney(position.totalValue, uncoveredValue);
    return {
      position: new NegativeStockPosition({
        companyId: position.companyId,
        productId: position.productId,
        locationId: position.locationId,
        lotId: position.lotId,
        quantity: addQuantity(position.quantity, effect.quantity),
        provisionalValue: negateMoney(uncoveredValue),
        lastKnownAverage: position.averageUnitCost,
        exposures: [{ sourceEffectId: effect.id, openQuantity: uncovered, provisionalUnitCost: position.averageUnitCost }],
        version: position.version + 1,
      }),
      effect: {
        stockEffectId: effect.id,
        method: "weighted_average",
        unitCost: position.averageUnitCost,
        valueDelta: negateMoney(totalIssuedValue),
        basis: "weighted_average",
      },
    };
  }

  applyIssue(effect: StockEffect): NegativeIssueApplication {
    this.assertMatching(effect);
    if (!isNegativeQuantity(effect.quantity)) {
      throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Negative stock issue must reduce quantity.");
    }
    const issued = absoluteQuantity(effect.quantity);
    const issuedValue = valueAt(issued, this.lastKnownAverage);
    return {
      position: new NegativeStockPosition({
        ...this,
        quantity: addQuantity(this.quantity, effect.quantity),
        provisionalValue: subtractMoney(this.provisionalValue, issuedValue),
        exposures: [...this.exposures, { sourceEffectId: effect.id, openQuantity: issued, provisionalUnitCost: this.lastKnownAverage }],
        version: this.version + 1,
      }),
      effect: {
        stockEffectId: effect.id,
        method: "weighted_average",
        unitCost: this.lastKnownAverage,
        valueDelta: negateMoney(issuedValue),
        basis: "weighted_average",
      },
    };
  }

  applyReceipt(effect: StockEffect, acquisitionValue: Money): NegativeReceiptApplication {
    this.assertMatching(effect);
    if (!isPositiveQuantity(effect.quantity) || !sameCurrency(acquisitionValue.currency, this.provisionalValue.currency)) {
      throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Negative stock receipt is invalid.");
    }
    const receiptUnitCost = unitCost(acquisitionValue, effect.quantity);
    const quantityToSettle = compareQuantity(effect.quantity, absoluteQuantity(this.quantity)) < 0
      ? effect.quantity
      : absoluteQuantity(this.quantity);
    const consumed = consumeExposures(this.exposures, quantityToSettle, effect.id, receiptUnitCost);
    const nextQuantity = addQuantity(this.quantity, effect.quantity);
    const effectResult: ValuationEffect = {
      stockEffectId: effect.id,
      method: "weighted_average",
      unitCost: receiptUnitCost,
      valueDelta: acquisitionValue,
      basis: "acquisition_cost",
    };

    if (isNegativeQuantity(nextQuantity)) {
      return {
        position: new NegativeStockPosition({
          ...this,
          quantity: nextQuantity,
          provisionalValue: negateMoney(consumed.remainingProvisionalValue),
          exposures: consumed.remaining,
          version: this.version + 1,
        }),
        effect: effectResult,
        settlements: consumed.settlements,
        costOfIssueAdjustment: consumed.adjustment,
      };
    }

    const valueRemainingInStock = subtractMoney(acquisitionValue, consumed.actualSettlementValue);
    return {
      position: new PositiveValuationPosition({
        companyId: this.companyId,
        productId: this.productId,
        locationId: this.locationId,
        lotId: this.lotId,
        quantity: nextQuantity,
        totalValue: valueRemainingInStock,
        averageUnitCost: isZeroQuantity(nextQuantity) ? null : unitCost(valueRemainingInStock, nextQuantity),
        version: this.version + 1,
      }),
      effect: effectResult,
      settlements: consumed.settlements,
      costOfIssueAdjustment: consumed.adjustment,
    };
  }

  private assertMatching(effect: StockEffect): void {
    if (effect.productId !== this.productId || effect.locationId !== this.locationId || effect.lotId !== this.lotId || effect.quantity.unit !== this.quantity.unit) {
      throw new InventoryFailure("INVENTORY_POSITION_MISMATCH", "Stock effect does not match the negative stock position.");
    }
  }
}

function consumeExposures(
  exposures: readonly NegativeStockExposure[],
  quantityToSettle: Quantity,
  receiptEffectId: StockEffectId,
  actualUnitCost: UnitCost,
): {
  readonly remaining: readonly NegativeStockExposure[];
  readonly settlements: readonly NegativeStockSettlement[];
  readonly remainingProvisionalValue: Money;
  readonly actualSettlementValue: Money;
  readonly adjustment: Money;
} {
  let pending = quantityToSettle;
  const remaining: NegativeStockExposure[] = [];
  const settlements: NegativeStockSettlement[] = [];
  let remainingProvisionalValue = moneyFromMinor(0n, actualUnitCost.currency);
  let actualSettlementValue = moneyFromMinor(0n, actualUnitCost.currency);
  let adjustment = moneyFromMinor(0n, actualUnitCost.currency);

  for (const exposure of exposures) {
    if (isZeroQuantity(pending)) {
      remaining.push(exposure);
      remainingProvisionalValue = addMoney(remainingProvisionalValue, valueAt(exposure.openQuantity, exposure.provisionalUnitCost));
      continue;
    }
    const settledQuantity = compareQuantity(exposure.openQuantity, pending) <= 0 ? exposure.openQuantity : pending;
    const provisionalCost = valueAt(settledQuantity, exposure.provisionalUnitCost);
    const actualCost = valueAt(settledQuantity, actualUnitCost);
    const costOfIssueAdjustment = subtractMoney(actualCost, provisionalCost);
    settlements.push({ sourceEffectId: exposure.sourceEffectId, receiptEffectId, quantity: settledQuantity, provisionalCost, actualCost, costOfIssueAdjustment });
    actualSettlementValue = addMoney(actualSettlementValue, actualCost);
    adjustment = addMoney(adjustment, costOfIssueAdjustment);
    const openQuantity = subtractQuantity(exposure.openQuantity, settledQuantity);
    if (!isZeroQuantity(openQuantity)) {
      remaining.push({ ...exposure, openQuantity });
      remainingProvisionalValue = addMoney(remainingProvisionalValue, valueAt(openQuantity, exposure.provisionalUnitCost));
    }
    pending = subtractQuantity(pending, settledQuantity);
  }
  return { remaining, settlements, remainingProvisionalValue, actualSettlementValue, adjustment };
}

function assertMatching(position: ValuationPosition, effect: StockEffect): void {
  if (effect.productId !== position.productId || effect.locationId !== position.locationId || effect.lotId !== position.lotId || effect.quantity.unit !== position.quantity.unit) {
    throw new InventoryFailure("INVENTORY_POSITION_MISMATCH", "Stock effect does not match the valuation position.");
  }
}

function unitCost(total: Money, quantity: Quantity): UnitCost {
  if (!isPositiveQuantity(quantity)) throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Unit cost requires positive quantity.");
  return { amount: divideDecimal(moneyToDecimal(total), quantity.amount), currency: total.currency, perUnit: quantity.unit };
}

function valueAt(quantity: Quantity, cost: UnitCost): Money {
  requireCompatibleCost(cost, quantity, cost.currency);
  return quantizeMoney(multiplyDecimal(quantity.amount, cost.amount), cost.currency, "half_up");
}

function requireCompatibleCost(cost: UnitCost, quantity: Quantity, currency: CurrencyDefinition): void {
  if (cost.perUnit !== quantity.unit || !sameCurrency(cost.currency, currency)) {
    throw new InventoryFailure("INVENTORY_VALUATION_INVALID", "Unit cost is incompatible with quantity or currency.");
  }
}
