import type { CompanyId } from "@kontave/companies-domain";
import type { ProductId } from "@kontave/products-domain";
import type { StockLotId } from "./identifiers.js";
import { InventoryFailure } from "./inventory-failure.js";
import { localDate, type LocalDate } from "./temporal.js";

export type StockLotStatus = "active" | "blocked" | "depleted";

export interface StockLotState {
  readonly id: StockLotId;
  readonly companyId: CompanyId;
  readonly productId: ProductId;
  readonly lotNumber: string;
  readonly manufacturedOn: LocalDate | null;
  readonly expiresOn: LocalDate | null;
  readonly status: StockLotStatus;
  readonly version: number;
}

export class StockLot {
  readonly id: StockLotId;
  readonly companyId: CompanyId;
  readonly productId: ProductId;
  readonly lotNumber: string;
  readonly manufacturedOn: LocalDate | null;
  readonly expiresOn: LocalDate | null;
  readonly status: StockLotStatus;
  readonly version: number;

  constructor(state: StockLotState) {
    const lotNumber = state.lotNumber.trim();
    if (!lotNumber || lotNumber.length > 128 || !Number.isSafeInteger(state.version) || state.version < 1) {
      throw new InventoryFailure("INVENTORY_LOT_INVALID", "Stock lot state is invalid.");
    }
    if (state.manufacturedOn !== null && state.expiresOn !== null && state.manufacturedOn > state.expiresOn) {
      throw new InventoryFailure("INVENTORY_LOT_INVALID", "Stock lot cannot expire before its manufacturing date.");
    }
    this.id = state.id;
    this.companyId = state.companyId;
    this.productId = state.productId;
    this.lotNumber = lotNumber;
    this.manufacturedOn = state.manufacturedOn;
    this.expiresOn = state.expiresOn;
    this.status = state.status;
    this.version = state.version;
  }

  assertUsable(onDate: string, expirationRequired: boolean): void {
    const date = localDate(onDate);
    if (this.status !== "active") {
      throw new InventoryFailure("INVENTORY_LOT_UNAVAILABLE", "Stock lot is not active.");
    }
    if (expirationRequired && this.expiresOn === null) {
      throw new InventoryFailure("INVENTORY_LOT_INVALID", "Stock lot requires an expiration date.");
    }
    if (this.expiresOn !== null && this.expiresOn < date) {
      throw new InventoryFailure("INVENTORY_LOT_UNAVAILABLE", "Stock lot is expired.");
    }
  }

  block(): StockLot {
    if (this.status !== "active") throw new InventoryFailure("INVENTORY_LOT_INVALID", "Only an active lot can be blocked.");
    return new StockLot({ ...this, status: "blocked", version: this.version + 1 });
  }
}
