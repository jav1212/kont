import type { CompanyId } from "@kontave/companies-domain";
import { InventoryFailure } from "./inventory-failure";
import { instant, inventoryMonth, monthOf, type Instant, type InventoryMonth, type LocalDate } from "./temporal";

export type InventoryPeriodStatus = "open" | "closed";

export interface InventoryPeriodState {
  readonly companyId: CompanyId;
  readonly month: InventoryMonth;
  readonly status: InventoryPeriodStatus;
  readonly closedAt: Instant | null;
  readonly version: number;
}

export class InventoryPeriod {
  readonly companyId: CompanyId;
  readonly month: InventoryMonth;
  readonly status: InventoryPeriodStatus;
  readonly closedAt: Instant | null;
  readonly version: number;

  constructor(state: InventoryPeriodState) {
    if (!Number.isSafeInteger(state.version) || state.version < 1 || (state.status === "closed") !== (state.closedAt !== null)) {
      throw new InventoryFailure("INVENTORY_DATE_INVALID", "Inventory period state is invalid.");
    }
    this.companyId = state.companyId;
    this.month = state.month;
    this.status = state.status;
    this.closedAt = state.closedAt;
    this.version = state.version;
  }

  static open(companyId: CompanyId, month: string): InventoryPeriod {
    return new InventoryPeriod({ companyId, month: inventoryMonth(month), status: "open", closedAt: null, version: 1 });
  }

  assertAccepts(effectiveDate: LocalDate): void {
    if (monthOf(effectiveDate) === this.month && this.status === "closed") {
      throw new InventoryFailure("INVENTORY_PERIOD_CLOSED", `Inventory period ${this.month} is closed.`);
    }
  }

  close(closedAt: string): InventoryPeriod {
    if (this.status !== "open") throw new InventoryFailure("INVENTORY_PERIOD_CLOSED", "Inventory period is already closed.");
    return new InventoryPeriod({ ...this, status: "closed", closedAt: instant(closedAt), version: this.version + 1 });
  }
}
