import {
  InventoryOperation,
  inventoryLocationId,
  localDate,
  quantity,
  stockLotId,
  type InventoryOperationId,
  type StockEffectId,
} from "@kontave/inventory-domain";
import type {
  AcquisitionCostStatus,
  PurchaseReceiptConfirmed,
  PurchaseReceiptReversed,
  PurchaseReturnConfirmed,
} from "@kontave/purchasing-domain";

export interface PurchasingInventoryIds {
  readonly operationId: InventoryOperationId;
  readonly effectIds: readonly StockEffectId[];
}
export interface ReceiptValuationInstruction {
  readonly stockEffectId: StockEffectId;
  readonly acquisitionValue: PurchaseReceiptConfirmed["lines"][number]["acquisitionValue"]["amount"];
  readonly status: AcquisitionCostStatus;
  readonly basis: string;
}
export interface PurchaseReceiptInventoryPosting {
  readonly operation: InventoryOperation;
  readonly valuations: readonly ReceiptValuationInstruction[];
}

export function purchaseReceiptInventoryPosting(event: PurchaseReceiptConfirmed, ids: PurchasingInventoryIds): PurchaseReceiptInventoryPosting {
  requireEffectIds(event.lines.length, ids.effectIds);
  const effects = event.lines.map((line, index) => ({
    id: requireEffectId(ids.effectIds, index), productId: line.productId,
    locationId: inventoryLocationId(line.inventoryLocationReference),
    lotId: line.lotReference === null ? null : stockLotId(line.lotReference),
    quantity: quantity(line.quantity.amount, line.quantity.unit),
  }));
  const operation = InventoryOperation.draft({
    id: ids.operationId, companyId: event.companyId, reason: "purchase_receipt", effectiveDate: localDate(event.effectiveDate),
    source: { kind: "purchasing", documentId: event.receiptId, operationKey: event.operationKey }, effects,
    reversalOf: null,
  }).post(event.occurredAt);
  return {
    operation,
    valuations: Object.freeze(event.lines.map((line, index) => ({
      stockEffectId: requireEffectId(ids.effectIds, index), acquisitionValue: line.acquisitionValue.amount,
      status: line.acquisitionValue.status, basis: line.acquisitionValue.basis,
    }))),
  };
}

export function purchaseReturnInventoryOperation(event: PurchaseReturnConfirmed, ids: PurchasingInventoryIds): InventoryOperation {
  requireEffectIds(event.lines.length, ids.effectIds);
  const effects = event.lines.map((line, index) => ({
    id: requireEffectId(ids.effectIds, index), productId: line.productId,
    locationId: inventoryLocationId(line.inventoryLocationReference),
    lotId: line.lotReference === null ? null : stockLotId(line.lotReference),
    quantity: quantity(`-${line.quantity.amount}`, line.quantity.unit),
  }));
  return InventoryOperation.draft({
    id: ids.operationId, companyId: event.companyId, reason: "supplier_return", effectiveDate: localDate(event.effectiveDate),
    source: { kind: "purchasing", documentId: event.returnId, operationKey: event.operationKey }, effects, reversalOf: null,
  }).post(event.occurredAt);
}

export function reversePurchaseReceiptInventoryOperation(input: {
  readonly original: InventoryOperation;
  readonly event: PurchaseReceiptReversed;
  readonly ids: PurchasingInventoryIds;
}): ReturnType<InventoryOperation["reverse"]> {
  requireEffectIds(input.original.effects.length, input.ids.effectIds);
  if (input.original.source.operationKey !== input.event.originalOperationKey || input.original.source.kind !== "purchasing") {
    throw new Error("Purchase receipt reversal does not match the original inventory operation.");
  }
  return input.original.reverse({
    id: input.ids.operationId, effectIds: input.ids.effectIds,
    effectiveDate: input.event.effectiveDate, postedAt: input.event.occurredAt,
    source: { kind: "purchasing", documentId: input.event.receiptId, operationKey: input.event.eventId },
  });
}

function requireEffectIds(length: number, ids: readonly StockEffectId[]): void {
  if (length !== ids.length) throw new Error("Purchasing inventory posting requires one stock effect identifier per line.");
}
function requireEffectId(ids: readonly StockEffectId[], index: number): StockEffectId {
  const id = ids[index];
  if (id === undefined) throw new Error("Purchasing inventory stock effect identifier is missing.");
  return id;
}
