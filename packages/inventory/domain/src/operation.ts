import type { CompanyId } from "@kontave/companies-domain";
import { addDecimal, exactDecimal } from "@kontave/monetary-domain";
import type { ProductId } from "@kontave/products-domain";
import type { InventoryLocationId, InventoryOperationId, StockEffectId, StockLotId } from "./identifiers";
import { InventoryFailure } from "./inventory-failure";
import {
  isNegativeQuantity,
  isPositiveQuantity,
  isZeroQuantity,
  negateQuantity,
  type Quantity,
} from "./quantity";
import { instant, localDate, type Instant, type LocalDate } from "./temporal";

export type InventoryOperationReason =
  | "opening_balance"
  | "purchase_receipt"
  | "sales_issue"
  | "customer_return"
  | "supplier_return"
  | "transfer"
  | "stock_count_adjustment"
  | "self_consumption"
  | "production_consumption"
  | "production_output"
  | "reversal";

export type InventoryOperationStatus = "draft" | "posted" | "reversed";
export type InventorySourceKind = "purchasing" | "sales" | "inventory" | "production" | "migration";

export interface InventoryOperationSource {
  readonly kind: InventorySourceKind;
  readonly documentId: string;
  readonly operationKey: string;
}

export interface StockEffect {
  readonly id: StockEffectId;
  readonly productId: ProductId;
  readonly locationId: InventoryLocationId;
  readonly lotId: StockLotId | null;
  readonly quantity: Quantity;
}

export function stockEffect(input: StockEffect): StockEffect {
  if (isZeroQuantity(input.quantity)) {
    throw new InventoryFailure("INVENTORY_QUANTITY_INVALID", "Stock effect quantity cannot be zero.");
  }
  return { ...input, quantity: { ...input.quantity } };
}

export interface InventoryOperationState {
  readonly id: InventoryOperationId;
  readonly companyId: CompanyId;
  readonly reason: InventoryOperationReason;
  readonly effectiveDate: LocalDate;
  readonly postedAt: Instant | null;
  readonly source: InventoryOperationSource;
  readonly effects: readonly StockEffect[];
  readonly status: InventoryOperationStatus;
  readonly reversalOf: InventoryOperationId | null;
  readonly reversedBy: InventoryOperationId | null;
}

export interface ReversalInput {
  readonly id: InventoryOperationId;
  readonly effectIds: readonly StockEffectId[];
  readonly effectiveDate: string;
  readonly postedAt: string;
  readonly source: InventoryOperationSource;
}

export interface InventoryReversal {
  readonly original: InventoryOperation;
  readonly reversal: InventoryOperation;
}

export class InventoryOperation {
  readonly id: InventoryOperationId;
  readonly companyId: CompanyId;
  readonly reason: InventoryOperationReason;
  readonly effectiveDate: LocalDate;
  readonly postedAt: Instant | null;
  readonly source: InventoryOperationSource;
  readonly effects: readonly StockEffect[];
  readonly status: InventoryOperationStatus;
  readonly reversalOf: InventoryOperationId | null;
  readonly reversedBy: InventoryOperationId | null;

  constructor(state: InventoryOperationState) {
    validateSource(state.source);
    if (state.effects.length === 0) {
      throw new InventoryFailure("INVENTORY_OPERATION_INVALID", "Inventory operation requires at least one stock effect.");
    }
    if (new Set(state.effects.map((effect) => effect.id)).size !== state.effects.length) {
      throw new InventoryFailure("INVENTORY_OPERATION_INVALID", "Inventory operation contains duplicate stock effect identifiers.");
    }
    const effects = state.effects.map(stockEffect);
    validateReason(state.reason, effects, state.reversalOf);
    if (state.status === "draft" && state.postedAt !== null) {
      throw new InventoryFailure("INVENTORY_OPERATION_INVALID", "Draft operation cannot have a posting instant.");
    }
    if (state.status !== "draft" && state.postedAt === null) {
      throw new InventoryFailure("INVENTORY_OPERATION_INVALID", "Posted operation requires a posting instant.");
    }
    this.id = state.id;
    this.companyId = state.companyId;
    this.reason = state.reason;
    this.effectiveDate = state.effectiveDate;
    this.postedAt = state.postedAt;
    this.source = { ...state.source };
    this.effects = Object.freeze(effects);
    this.status = state.status;
    this.reversalOf = state.reversalOf;
    this.reversedBy = state.reversedBy;
  }

  static draft(input: Omit<InventoryOperationState, "status" | "postedAt" | "reversedBy">): InventoryOperation {
    return new InventoryOperation({ ...input, status: "draft", postedAt: null, reversedBy: null });
  }

  post(postedAt: string): InventoryOperation {
    if (this.status !== "draft") {
      throw new InventoryFailure("INVENTORY_OPERATION_TRANSITION_INVALID", "Only a draft operation can be posted.");
    }
    return new InventoryOperation({ ...this, status: "posted", postedAt: instant(postedAt) });
  }

  reverse(input: ReversalInput): InventoryReversal {
    if (this.status !== "posted") {
      throw new InventoryFailure("INVENTORY_OPERATION_TRANSITION_INVALID", "Only a posted operation can be reversed.");
    }
    if (input.effectIds.length !== this.effects.length) {
      throw new InventoryFailure("INVENTORY_OPERATION_INVALID", "Reversal requires one new identifier per original effect.");
    }
    const reversedEffects = this.effects.map((effect, index) => {
      const id = input.effectIds[index];
      if (id === undefined) throw new InventoryFailure("INVENTORY_OPERATION_INVALID", "Reversal effect identifier is missing.");
      return stockEffect({ ...effect, id, quantity: negateQuantity(effect.quantity) });
    });
    const reversal = new InventoryOperation({
      id: input.id,
      companyId: this.companyId,
      reason: "reversal",
      effectiveDate: localDate(input.effectiveDate),
      postedAt: instant(input.postedAt),
      source: input.source,
      effects: reversedEffects,
      status: "posted",
      reversalOf: this.id,
      reversedBy: null,
    });
    return {
      original: new InventoryOperation({ ...this, status: "reversed", reversedBy: reversal.id }),
      reversal,
    };
  }
}

function validateSource(source: InventoryOperationSource): void {
  if (!source.documentId.trim() || !source.operationKey.trim() || source.documentId.length > 128 || source.operationKey.length > 200) {
    throw new InventoryFailure("INVENTORY_OPERATION_INVALID", "Inventory operation source is invalid.");
  }
}

function validateReason(reason: InventoryOperationReason, effects: readonly StockEffect[], reversalOf: InventoryOperationId | null): void {
  const positiveReasons: readonly InventoryOperationReason[] = ["opening_balance", "purchase_receipt", "customer_return", "production_output"];
  const negativeReasons: readonly InventoryOperationReason[] = ["sales_issue", "supplier_return", "self_consumption", "production_consumption"];
  if (positiveReasons.includes(reason) && effects.some((effect) => !isPositiveQuantity(effect.quantity))) {
    throw new InventoryFailure("INVENTORY_OPERATION_INVALID", `${reason} requires positive stock effects.`);
  }
  if (negativeReasons.includes(reason) && effects.some((effect) => !isNegativeQuantity(effect.quantity))) {
    throw new InventoryFailure("INVENTORY_OPERATION_INVALID", `${reason} requires negative stock effects.`);
  }
  if (reason === "transfer") validateTransfer(effects);
  if ((reason === "reversal") !== (reversalOf !== null)) {
    throw new InventoryFailure("INVENTORY_OPERATION_INVALID", "Only reversal operations may reference an original operation.");
  }
}

function validateTransfer(effects: readonly StockEffect[]): void {
  if (new Set(effects.map((effect) => effect.locationId)).size < 2) {
    throw new InventoryFailure("INVENTORY_TRANSFER_UNBALANCED", "Inventory transfer requires at least two locations.");
  }
  const totals = new Map<string, ReturnType<typeof exactDecimal>>();
  for (const effect of effects) {
    const key = `${effect.productId}|${effect.lotId ?? ""}|${effect.quantity.unit}`;
    totals.set(key, addDecimal(totals.get(key) ?? exactDecimal("0"), effect.quantity.amount));
  }
  if ([...totals.values()].some((total) => total !== "0")) {
    throw new InventoryFailure("INVENTORY_TRANSFER_UNBALANCED", "Inventory transfer must preserve quantity for every product and lot.");
  }
}
