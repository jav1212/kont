import type { CompanyId } from "@kontave/companies/domain";
import type { ProductId } from "@kontave/products/domain";
import type { CrossCompanyInventoryTransferId } from "./identifiers";
import { InventoryFailure } from "./inventory-failure";
import { isPositiveQuantity, type Quantity } from "./quantity";
import { localDate, type LocalDate } from "./temporal";

/** Explicit source-to-destination product mapping for one physical transfer line. */
export interface CrossCompanyInventoryTransferLine {
  readonly sourceProductId: ProductId;
  readonly destinationProductId: ProductId;
  readonly quantity: Quantity;
}

/** Immutable transfer intent before an adapter prices and posts both inventory sides. */
export interface CrossCompanyInventoryTransferState {
  readonly id: CrossCompanyInventoryTransferId;
  readonly sourceCompanyId: CompanyId;
  readonly destinationCompanyId: CompanyId;
  readonly effectiveDate: LocalDate;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly lines: readonly CrossCompanyInventoryTransferLine[];
}

/**
 * Validates a one-to-one source/destination product mapping for a transfer.
 * Each line is deliberately explicit: matching by SKU, name, or barcode belongs
 * to a separate catalog-mapping decision and is never inferred during posting.
 * @param lines - Caller-provided physical quantities and product identities.
 * @returns Frozen, normalized transfer lines.
 * @throws {InventoryFailure} When a mapping is ambiguous or its quantity is not positive.
 */
export function crossCompanyInventoryTransferLines(
  lines: readonly CrossCompanyInventoryTransferLine[],
): readonly CrossCompanyInventoryTransferLine[] {
  if (lines.length < 1 || lines.length > 100) {
    throw new InventoryFailure("INVENTORY_CROSS_COMPANY_TRANSFER_INVALID", "A cross-company transfer requires between one and one hundred lines.");
  }
  const sourceProducts = new Set<string>();
  const destinationProducts = new Set<string>();
  const normalized = lines.map((line) => {
    if (!line.sourceProductId || !line.destinationProductId || !isPositiveQuantity(line.quantity)) {
      throw new InventoryFailure("INVENTORY_CROSS_COMPANY_TRANSFER_INVALID", "A cross-company transfer line is invalid.");
    }
    if (sourceProducts.has(line.sourceProductId) || destinationProducts.has(line.destinationProductId)) {
      throw new InventoryFailure("INVENTORY_CROSS_COMPANY_TRANSFER_INVALID", "A cross-company transfer requires one-to-one product mappings.");
    }
    sourceProducts.add(line.sourceProductId);
    destinationProducts.add(line.destinationProductId);
    return Object.freeze({
      sourceProductId: line.sourceProductId,
      destinationProductId: line.destinationProductId,
      quantity: Object.freeze({ ...line.quantity }),
    });
  });
  return Object.freeze(normalized);
}

/**
 * Immutable physical transfer between two distinct company inventories.
 * It carries quantities only. The repository is the authoritative boundary for
 * source weighted cost, VES valuation, stock, periods, authorization, and the paired posting.
 */
export class CrossCompanyInventoryTransfer {
  readonly id: CrossCompanyInventoryTransferId;
  readonly sourceCompanyId: CompanyId;
  readonly destinationCompanyId: CompanyId;
  readonly effectiveDate: LocalDate;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly lines: readonly CrossCompanyInventoryTransferLine[];

  /**
   * @param state - Identity, two company resources, effective date, evidence, and explicit lines.
   * @throws {InventoryFailure} When companies match or the physical mapping is invalid.
   */
  constructor(state: CrossCompanyInventoryTransferState) {
    if (!state.id || !state.sourceCompanyId || !state.destinationCompanyId || state.sourceCompanyId === state.destinationCompanyId) {
      throw new InventoryFailure("INVENTORY_CROSS_COMPANY_TRANSFER_INVALID", "Cross-company transfer source and destination must be distinct companies.");
    }
    this.id = state.id;
    this.sourceCompanyId = state.sourceCompanyId;
    this.destinationCompanyId = state.destinationCompanyId;
    this.effectiveDate = localDate(state.effectiveDate);
    this.reference = normalizeOptionalText(state.reference, 160, "reference");
    this.notes = normalizeOptionalText(state.notes, 2_000, "notes");
    this.lines = crossCompanyInventoryTransferLines(state.lines);
  }
}

function normalizeOptionalText(value: string | null, maximum: number, label: string): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length > maximum || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new InventoryFailure("INVENTORY_CROSS_COMPANY_TRANSFER_INVALID", `The cross-company transfer ${label} is invalid.`);
  }
  return normalized || null;
}
