import type { CompanyId } from "@kontave/companies/domain";
import type { InventoryLocationId } from "./identifiers";
import { InventoryFailure } from "./inventory-failure";

export type InventoryLocationStatus = "active" | "inactive";

export interface InventoryLocationState {
  readonly id: InventoryLocationId;
  readonly companyId: CompanyId;
  readonly name: string;
  readonly description: string | null;
  readonly status: InventoryLocationStatus;
  readonly version: number;
}

/** Company-owned physical or logical inventory location. */
export class InventoryLocation {
  readonly id: InventoryLocationId;
  readonly companyId: CompanyId;
  readonly name: string;
  readonly description: string | null;
  readonly status: InventoryLocationStatus;
  readonly version: number;

  /** @param state - Complete location state. @throws {InventoryFailure} When identity, text or version is invalid. */
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

  /** @returns A new inactive location version. @throws {InventoryFailure} Unless currently active. */
  deactivate(): InventoryLocation {
    if (this.status !== "active") {
      throw new InventoryFailure("INVENTORY_LOCATION_INVALID", "Only an active inventory location can be deactivated.");
    }
    return new InventoryLocation({ ...this, status: "inactive", version: this.version + 1 });
  }
}
