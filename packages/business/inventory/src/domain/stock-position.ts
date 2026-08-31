import type { CompanyId } from "@kontave/companies/domain";
import type { ProductId } from "@kontave/products/domain";
import type { InventoryLocationId, StockLotId } from "./identifiers";
import type { InventoryProfile } from "./inventory-profile";
import { InventoryFailure } from "./inventory-failure";
import type { StockEffect } from "./operation";
import { addQuantity, isNegativeQuantity, type Quantity } from "./quantity";

export interface StockPositionState {
  readonly companyId: CompanyId;
  readonly productId: ProductId;
  readonly locationId: InventoryLocationId;
  readonly lotId: StockLotId | null;
  readonly onHand: Quantity;
  readonly version: number;
}

/** Exact on-hand position for one product, location, lot and unit tuple. */
export class StockPosition {
  readonly companyId: CompanyId;
  readonly productId: ProductId;
  readonly locationId: InventoryLocationId;
  readonly lotId: StockLotId | null;
  readonly onHand: Quantity;
  readonly version: number;

  /** @param state - Complete stock-position state. @throws {InventoryFailure} When the tuple or quantity is invalid. */
  constructor(state: StockPositionState) {
    if (!Number.isSafeInteger(state.version) || state.version < 0) {
      throw new InventoryFailure("INVENTORY_POSITION_MISMATCH", "Stock position version is invalid.");
    }
    this.companyId = state.companyId;
    this.productId = state.productId;
    this.locationId = state.locationId;
    this.lotId = state.lotId;
    this.onHand = { ...state.onHand };
    this.version = state.version;
  }

  /** @param effect - Stock effect to apply. @param profile - Product inventory policy. @returns The resulting position. @throws {InventoryFailure} When tuple or policy constraints fail. */
  apply(effect: StockEffect, profile: InventoryProfile): StockPosition {
    profile.assertAccepts(effect);
    if (profile.companyId !== this.companyId || effect.productId !== this.productId || effect.locationId !== this.locationId || effect.lotId !== this.lotId) {
      throw new InventoryFailure("INVENTORY_POSITION_MISMATCH", "Stock effect does not match the stock position.");
    }
    const onHand = addQuantity(this.onHand, effect.quantity);
    if (profile.negativeStockPolicy.mode === "forbidden" && isNegativeQuantity(onHand)) {
      throw new InventoryFailure("INVENTORY_NEGATIVE_STOCK", "Stock effect would produce a negative position.");
    }
    return new StockPosition({ ...this, onHand, version: this.version + 1 });
  }
}
