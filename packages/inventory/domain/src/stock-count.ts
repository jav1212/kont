import type { CompanyId } from "@kontave/companies-domain";
import type { ProductId } from "@kontave/products-domain";
import type {
  InventoryLocationId,
  InventoryOperationId,
  StockCountId,
  StockCountLineId,
  StockEffectId,
  StockLotId,
} from "./identifiers";
import { InventoryFailure } from "./inventory-failure";
import {
  InventoryOperation,
  stockEffect,
  type InventoryOperationSource,
  type StockEffect,
} from "./operation";
import {
  isNegativeQuantity,
  isZeroQuantity,
  subtractQuantity,
  type Quantity,
} from "./quantity";
import { instant, localDate, type Instant, type LocalDate } from "./temporal";

export interface StockCountLine {
  readonly id: StockCountLineId;
  readonly productId: ProductId;
  readonly lotId: StockLotId | null;
  readonly expected: Quantity;
  readonly counted: Quantity;
}

export type StockCountStatus = "draft" | "confirmed" | "cancelled";

export interface StockCountState {
  readonly id: StockCountId;
  readonly companyId: CompanyId;
  readonly locationId: InventoryLocationId;
  readonly countedOn: LocalDate;
  readonly lines: readonly StockCountLine[];
  readonly status: StockCountStatus;
  readonly confirmedAt: Instant | null;
  readonly adjustmentOperationId: InventoryOperationId | null;
  readonly version: number;
}

export type StockCountDraftInput = Omit<StockCountState, "countedOn" | "status" | "confirmedAt" | "adjustmentOperationId"> & {
  readonly countedOn: string;
};

export interface ConfirmStockCountInput {
  readonly operationId: InventoryOperationId;
  readonly effectIds: readonly StockEffectId[];
  readonly source: InventoryOperationSource;
  readonly confirmedAt: string;
}

export interface StockCountConfirmation {
  readonly count: StockCount;
  readonly adjustment: InventoryOperation | null;
}

export class StockCount {
  readonly id: StockCountId;
  readonly companyId: CompanyId;
  readonly locationId: InventoryLocationId;
  readonly countedOn: LocalDate;
  readonly lines: readonly StockCountLine[];
  readonly status: StockCountStatus;
  readonly confirmedAt: Instant | null;
  readonly adjustmentOperationId: InventoryOperationId | null;
  readonly version: number;

  constructor(state: StockCountState) {
    if (state.lines.length === 0 || !Number.isSafeInteger(state.version) || state.version < 1) {
      throw new InventoryFailure("INVENTORY_COUNT_INVALID", "Stock count state is invalid.");
    }
    const keys = new Set<string>();
    const lines = state.lines.map((line) => {
      if (line.expected.unit !== line.counted.unit || isNegativeQuantity(line.expected) || isNegativeQuantity(line.counted)) {
        throw new InventoryFailure("INVENTORY_COUNT_INVALID", "Stock count quantities are invalid.");
      }
      const key = `${line.productId}|${line.lotId ?? ""}`;
      if (keys.has(key)) throw new InventoryFailure("INVENTORY_COUNT_INVALID", "Stock count contains a duplicate product and lot.");
      keys.add(key);
      return { ...line, expected: { ...line.expected }, counted: { ...line.counted } };
    });
    if ((state.status === "confirmed") !== (state.confirmedAt !== null)) {
      throw new InventoryFailure("INVENTORY_COUNT_INVALID", "Stock count confirmation state is invalid.");
    }
    this.id = state.id;
    this.companyId = state.companyId;
    this.locationId = state.locationId;
    this.countedOn = state.countedOn;
    this.lines = Object.freeze(lines);
    this.status = state.status;
    this.confirmedAt = state.confirmedAt;
    this.adjustmentOperationId = state.adjustmentOperationId;
    this.version = state.version;
  }

  confirm(input: ConfirmStockCountInput): StockCountConfirmation {
    if (this.status !== "draft") throw new InventoryFailure("INVENTORY_COUNT_INVALID", "Only a draft stock count can be confirmed.");
    const differences = this.lines
      .map((line) => ({ line, difference: subtractQuantity(line.counted, line.expected) }))
      .filter(({ difference }) => !isZeroQuantity(difference));
    if (input.effectIds.length !== differences.length) {
      throw new InventoryFailure("INVENTORY_COUNT_INVALID", "Stock count requires one effect identifier per difference.");
    }
    const effects: StockEffect[] = differences.map(({ line, difference }, index) => {
      const id = input.effectIds[index];
      if (id === undefined) throw new InventoryFailure("INVENTORY_COUNT_INVALID", "Stock count effect identifier is missing.");
      return stockEffect({ id, productId: line.productId, locationId: this.locationId, lotId: line.lotId, quantity: difference });
    });
    const confirmedAt = instant(input.confirmedAt);
    const adjustment = effects.length === 0
      ? null
      : InventoryOperation.draft({
          id: input.operationId,
          companyId: this.companyId,
          reason: "stock_count_adjustment",
          effectiveDate: this.countedOn,
          source: input.source,
          effects,
          reversalOf: null,
        });
    return {
      count: new StockCount({
        ...this,
        status: "confirmed",
        confirmedAt,
        adjustmentOperationId: adjustment?.id ?? null,
        version: this.version + 1,
      }),
      adjustment,
    };
  }

  static draft(input: StockCountDraftInput): StockCount {
    return new StockCount({
      ...input,
      countedOn: localDate(input.countedOn),
      status: "draft",
      confirmedAt: null,
      adjustmentOperationId: null,
    });
  }
}
