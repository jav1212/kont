import type { CompanyId } from "@kontave/companies-domain";
import type { ProductId } from "@kontave/products-domain";
import type { StockEffect } from "./operation";
import { InventoryFailure } from "./inventory-failure";

export type TrackingPolicy =
  | { readonly method: "none" }
  | { readonly method: "lot"; readonly expirationRequired: boolean };

export type NegativeStockPolicy =
  | { readonly mode: "forbidden" }
  | { readonly mode: "allowed"; readonly provisionalValuation: "last_known_average" };
export type ValuationPolicy = { readonly method: "weighted_average" };
export type InventoryProfileStatus = "active" | "inactive";

export interface InventoryProfileState {
  readonly productId: ProductId;
  readonly companyId: CompanyId;
  readonly trackingPolicy: TrackingPolicy;
  readonly negativeStockPolicy: NegativeStockPolicy;
  readonly valuationPolicy: ValuationPolicy;
  readonly status: InventoryProfileStatus;
  readonly version: number;
}

export class InventoryProfile {
  readonly productId: ProductId;
  readonly companyId: CompanyId;
  readonly trackingPolicy: TrackingPolicy;
  readonly negativeStockPolicy: NegativeStockPolicy;
  readonly valuationPolicy: ValuationPolicy;
  readonly status: InventoryProfileStatus;
  readonly version: number;

  constructor(state: InventoryProfileState) {
    if (!Number.isSafeInteger(state.version) || state.version < 1) {
      throw new InventoryFailure("INVENTORY_PROFILE_INVALID", "Inventory profile version is invalid.");
    }
    this.productId = state.productId;
    this.companyId = state.companyId;
    this.trackingPolicy = state.trackingPolicy;
    this.negativeStockPolicy = state.negativeStockPolicy;
    this.valuationPolicy = state.valuationPolicy;
    this.status = state.status;
    this.version = state.version;
  }

  assertAccepts(effect: StockEffect): void {
    if (this.status !== "active") {
      throw new InventoryFailure("INVENTORY_PROFILE_INACTIVE", "Inactive inventory profile cannot receive stock effects.");
    }
    if (effect.productId !== this.productId) {
      throw new InventoryFailure("INVENTORY_PROFILE_INVALID", "Stock effect belongs to another product.");
    }
    if (this.trackingPolicy.method === "lot" && effect.lotId === null) {
      throw new InventoryFailure("INVENTORY_LOT_REQUIRED", "Inventory profile requires a lot for every stock effect.");
    }
    if (this.trackingPolicy.method === "none" && effect.lotId !== null) {
      throw new InventoryFailure("INVENTORY_LOT_NOT_ALLOWED", "Inventory profile does not allow lot tracking.");
    }
  }

  deactivate(): InventoryProfile {
    if (this.status !== "active") {
      throw new InventoryFailure("INVENTORY_PROFILE_INVALID", "Only an active inventory profile can be deactivated.");
    }
    return new InventoryProfile({ ...this, status: "inactive", version: this.version + 1 });
  }

  activate(): InventoryProfile {
    if (this.status !== "inactive") {
      throw new InventoryFailure("INVENTORY_PROFILE_INVALID", "Only an inactive inventory profile can be activated.");
    }
    return new InventoryProfile({ ...this, status: "active", version: this.version + 1 });
  }
}
