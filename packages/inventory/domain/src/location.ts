import type { CompanyId } from "@kontave/companies-domain";
import type { InventoryLocationId } from "./identifiers.js";
import { InventoryFailure } from "./inventory-failure.js";

export type InventoryLocationStatus = "active" | "inactive";

export interface InventoryLocationState {
  readonly id: InventoryLocationId;
  readonly companyId: CompanyId;
  readonly name: string;
  readonly description: string | null;
  readonly status: InventoryLocationStatus;
  readonly version: number;
}

export class InventoryLocation {
  readonly id: InventoryLocationId;
  readonly companyId: CompanyId;
  readonly name: string;
  readonly description: string | null;
  readonly status: InventoryLocationStatus;
  readonly version: number;

  constructor(state: InventoryLocationState) {
    const name = state.name.trim();
    const description = state.description?.trim() || null;
    if (!name || name.length > 160 || (description !== null && description.length > 500)) {
      throw new InventoryFailure("INVENTORY_LOCATION_INVALID", "Inventory location details are invalid.");
    }
    if (!Number.isSafeInteger(state.version) || state.version < 1) {
      throw new InventoryFailure("INVENTORY_LOCATION_INVALID", "Inventory location version is invalid.");
    }
    this.id = state.id;
    this.companyId = state.companyId;
    this.name = name;
    this.description = description;
    this.status = state.status;
    this.version = state.version;
  }

  deactivate(): InventoryLocation {
    if (this.status !== "active") {
      throw new InventoryFailure("INVENTORY_LOCATION_INVALID", "Only an active inventory location can be deactivated.");
    }
    return new InventoryLocation({ ...this, status: "inactive", version: this.version + 1 });
  }
}
