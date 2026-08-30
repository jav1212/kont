import {
  InventoryOperation, inventoryLocationId, localDate, quantity, stockLotId,
  type InventoryOperationId, type StockEffectId,
} from "@kontave/inventory-domain";
import {
  SalesFailure,
  type CustomerReturnConfirmed,
  type GoodsDispatchLineId,
  type SalesDispatchConfirmed,
  type SalesDispatchReversed,
} from "@kontave/sales-domain";

export interface SalesInventoryIds {
  readonly operationId: InventoryOperationId;
  readonly effectIds: readonly StockEffectId[];
}
export interface CustomerReturnValuationInstruction {
  readonly stockEffectId: StockEffectId;
  readonly originalDispatchLineId: GoodsDispatchLineId;
}
export interface CustomerReturnInventoryPosting {
  readonly operation: InventoryOperation;
  readonly valuations: readonly CustomerReturnValuationInstruction[];
}

/**
 * Builds the outbound inventory operation for a confirmed dispatch.
 * @param event Confirmed sales-dispatch event.
 * @param ids Inventory identifiers allocated to this posting.
 * @returns A posted inventory operation.
 * @throws {SalesFailure} When the effect identifiers do not match the dispatch lines.
 */
export function salesDispatchInventoryOperation(
  event: SalesDispatchConfirmed,
  ids: SalesInventoryIds,
): InventoryOperation {
  requireEffectIds(event.lines.length, ids.effectIds);
  const effects = event.lines.map((line, index) => ({
    id: requireEffectId(ids.effectIds, index), productId: line.productId,
    locationId: inventoryLocationId(line.inventoryLocationReference),
    lotId: line.lotReference === null ? null : stockLotId(line.lotReference),
    quantity: quantity(`-${line.quantity.amount}`, line.quantity.unit),
  }));
  return InventoryOperation.draft({
    id: ids.operationId, companyId: event.companyId, reason: "sales_issue", effectiveDate: localDate(event.effectiveDate),
    source: { kind: "sales", documentId: event.dispatchId, operationKey: event.operationKey }, effects, reversalOf: null,
  }).post(event.occurredAt);
}

/**
 * Builds the inventory operation and valuation instructions for a customer return.
 * @param event Confirmed customer-return event.
 * @param ids Inventory identifiers allocated to this posting.
 * @returns The inventory operation and original-dispatch valuation references.
 * @throws {SalesFailure} When the effect identifiers do not match the return lines.
 */
export function customerReturnInventoryPosting(
  event: CustomerReturnConfirmed,
  ids: SalesInventoryIds,
): CustomerReturnInventoryPosting {
  requireEffectIds(event.lines.length, ids.effectIds);
  const effects = event.lines.map((line, index) => ({
    id: requireEffectId(ids.effectIds, index), productId: line.productId,
    locationId: inventoryLocationId(line.inventoryLocationReference),
    lotId: line.lotReference === null ? null : stockLotId(line.lotReference),
    quantity: quantity(line.quantity.amount, line.quantity.unit),
  }));
  const operation = InventoryOperation.draft({
    id: ids.operationId, companyId: event.companyId, reason: "customer_return", effectiveDate: localDate(event.effectiveDate),
    source: { kind: "sales", documentId: event.returnId, operationKey: event.operationKey }, effects, reversalOf: null,
  }).post(event.occurredAt);
  return {
    operation,
    valuations: Object.freeze(event.lines.map((line, index) => ({ stockEffectId: requireEffectId(ids.effectIds, index), originalDispatchLineId: line.dispatchLineId }))),
  };
}

/**
 * Reverses the inventory operation associated with a sales dispatch.
 * @param input Original operation, reversal event, and allocated identifiers.
 * @returns The original operation and its posted reversal.
 * @throws {SalesFailure} When event provenance or effect identifiers do not match.
 */
export function reverseSalesDispatchInventoryOperation(input: {
  readonly original: InventoryOperation;
  readonly event: SalesDispatchReversed;
  readonly ids: SalesInventoryIds;
}): ReturnType<InventoryOperation["reverse"]> {
  requireEffectIds(input.original.effects.length, input.ids.effectIds);
  if (input.original.source.operationKey !== input.event.originalOperationKey || input.original.source.kind !== "sales") {
    throw new SalesFailure(
      "SALES_INVENTORY_UNAVAILABLE",
      "Sales dispatch reversal does not match the original inventory operation.",
    );
  }
  return input.original.reverse({
    id: input.ids.operationId, effectIds: input.ids.effectIds,
    effectiveDate: input.event.effectiveDate, postedAt: input.event.occurredAt,
    source: { kind: "sales", documentId: input.event.dispatchId, operationKey: input.event.eventId },
  });
}

function requireEffectIds(length: number, ids: readonly StockEffectId[]): void {
  if (length !== ids.length) {
    throw new SalesFailure(
      "SALES_INVENTORY_UNAVAILABLE",
      "Sales inventory posting requires one stock effect identifier per line.",
    );
  }
}
function requireEffectId(ids: readonly StockEffectId[], index: number): StockEffectId {
  const id = ids[index];
  if (id === undefined) {
    throw new SalesFailure(
      "SALES_INVENTORY_UNAVAILABLE",
      "Sales inventory stock effect identifier is missing.",
    );
  }
  return id;
}
