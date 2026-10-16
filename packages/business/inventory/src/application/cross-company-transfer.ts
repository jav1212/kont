import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import type { ProductId, UnitOfMeasure } from "@kontave/products/domain";
import {
  CrossCompanyInventoryTransfer,
  crossCompanyInventoryTransferId,
  crossCompanyInventoryTransferLines,
  InventoryFailure,
  localDate,
  quantity,
  type CrossCompanyInventoryTransferId,
} from "../domain";

/** Read-only request that pins the two inventory sides before a transfer is posted. */
export interface PreviewCrossCompanyInventoryTransferCommand {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly sourceCompanyId: CompanyId;
  readonly destinationCompanyId: CompanyId;
  readonly effectiveDate: string;
  readonly lines: readonly CrossCompanyInventoryTransferCommandLine[];
}

/** Opaque pair of revision tokens for the exact transfer date, companies, and mapped lines. */
export interface CrossCompanyInventoryTransferPreview {
  readonly sourceCompanyId: CompanyId;
  readonly destinationCompanyId: CompanyId;
  readonly sourceSnapshotToken: string;
  readonly destinationSnapshotToken: string;
}

/** Snapshot expectations that pin the two inventory sides before atomic posting. */
export interface CrossCompanyInventoryTransferSnapshotExpectation {
  /** Opaque source snapshot covering every source product and stock state used by the request. */
  readonly expectedSourceSnapshotToken: string;
  /** Opaque destination snapshot covering every mapped destination product and valuation state. */
  readonly expectedDestinationSnapshotToken: string;
}

/** One wire-safe transfer line with an explicit product mapping and exact quantity text. */
export interface CrossCompanyInventoryTransferCommandLine {
  readonly sourceProductId: ProductId;
  readonly destinationProductId: ProductId;
  readonly quantity: string;
  readonly unit: UnitOfMeasure;
}

/** Command for a paired physical transfer between two company inventories in one organization. */
export interface ExecuteCrossCompanyInventoryTransferCommand extends CrossCompanyInventoryTransferSnapshotExpectation {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly transferId: CrossCompanyInventoryTransferId;
  readonly sourceCompanyId: CompanyId;
  readonly destinationCompanyId: CompanyId;
  readonly effectiveDate: string;
  readonly reference?: string | null;
  readonly notes?: string | null;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly lines: readonly CrossCompanyInventoryTransferCommandLine[];
}

/** Durable evidence that both company sides were posted, or returned by an exact idempotent replay. */
export interface CrossCompanyInventoryTransferReceipt {
  readonly transferId: CrossCompanyInventoryTransferId;
  readonly sourceCompanyId: CompanyId;
  readonly destinationCompanyId: CompanyId;
  readonly sourceOperationId: string;
  readonly destinationOperationId: string;
  readonly replayed: boolean;
}

/**
 * Atomic port for the operational portion of ADM-015.
 * The implementation must authorize source `inventory.read` plus source and destination
 * `inventory.update`, assert both companies belong to the supplied organization and tenant,
 * lock every mapped product in deterministic order, validate periods and stock, derive VES
 * source cost, and write a paired debit/credit with one fingerprinted idempotency receipt.
 */
export interface CrossCompanyInventoryTransferRepository {
  /**
   * Reads the exact source and destination state relevant to this transfer without writing it.
   * Tokens must cover the effective date and every mapped product state the execution will lock.
   * @param command - Validated two-company scope, date, and explicit product mappings.
   * @returns Opaque source and destination precondition tokens.
   * @throws {InventoryFailure} When authorization, scope, or the preview state is invalid.
   */
  preview(command: PreviewCrossCompanyInventoryTransferCommand): Promise<CrossCompanyInventoryTransferPreview>;
  /**
   * Posts the source issue and destination receipt as one indivisible operation.
   * A retry with the same complete intent returns the original receipt; reuse of the
   * idempotency key for different intent fails. It must reject partial posting, source or
   * destination snapshot drift, negative stock, closed periods, and foreign company scope.
   * @param command - Normalized transfer intent and two snapshot preconditions.
   * @returns Paired operation identifiers and replay status.
   * @throws {InventoryFailure} When authorization, invariant, concurrency, or persistence fails.
   */
  execute(command: ExecuteCrossCompanyInventoryTransferCommand): Promise<CrossCompanyInventoryTransferReceipt>;
}

/** Previews exact source and destination inventory state before any physical transfer is posted. */
export class PreviewCrossCompanyInventoryTransfer {
  /** @param repository - Read-only transfer preview boundary. */
  constructor(private readonly repository: Pick<CrossCompanyInventoryTransferRepository, "preview">) {}

  /**
   * @param command - Actor scope, companies, date, and explicit product mappings.
   * @returns Opaque snapshot tokens that must be supplied unchanged to execution.
   * @throws {InventoryFailure} When the request or persistence preview is invalid.
   */
  async execute(command: PreviewCrossCompanyInventoryTransferCommand): Promise<CrossCompanyInventoryTransferPreview> {
    const normalized = normalizePreview(command);
    return assertPreview(normalized, await repositoryCall(() => this.repository.preview(normalized)));
  }
}

/** Posts an explicitly mapped, VES-valued company-to-company inventory transfer. */
export class ExecuteCrossCompanyInventoryTransfer {
  /** @param repository - Atomic persistence boundary for both company inventory sides. */
  constructor(private readonly repository: CrossCompanyInventoryTransferRepository) {}

  /**
   * @param command - Actor scope, mapping, snapshot expectations, evidence, correlation, and idempotency key.
   * @returns The durable paired-posting receipt.
   * @throws {InventoryFailure} When the command or persistence result violates the ADM-015 contract.
   */
  async execute(command: ExecuteCrossCompanyInventoryTransferCommand): Promise<CrossCompanyInventoryTransferReceipt> {
    const normalized = normalize(command);
    return assertReceipt(normalized, await repositoryCall(() => this.repository.execute(normalized)));
  }
}

function normalize(command: ExecuteCrossCompanyInventoryTransferCommand): ExecuteCrossCompanyInventoryTransferCommand {
  const physical = normalizePhysical(command);
  const transfer = new CrossCompanyInventoryTransfer({
    id: crossCompanyInventoryTransferId(command.transferId),
    ...physical,
    reference: command.reference ?? null,
    notes: command.notes ?? null,
  });
  return Object.freeze({
    ...command,
    transferId: transfer.id,
    sourceCompanyId: transfer.sourceCompanyId,
    destinationCompanyId: transfer.destinationCompanyId,
    effectiveDate: transfer.effectiveDate,
    reference: transfer.reference,
    notes: transfer.notes,
    lines: Object.freeze(transfer.lines.map((line) => Object.freeze({
      sourceProductId: line.sourceProductId,
      destinationProductId: line.destinationProductId,
      quantity: line.quantity.amount,
      unit: line.quantity.unit,
    }))),
    expectedSourceSnapshotToken: snapshotToken(command.expectedSourceSnapshotToken, "source"),
    expectedDestinationSnapshotToken: snapshotToken(command.expectedDestinationSnapshotToken, "destination"),
    correlationId: boundedText(command.correlationId, "correlation identifier", 128),
    idempotencyKey: boundedText(command.idempotencyKey, "idempotency key", 128),
  });
}

function normalizePreview(command: PreviewCrossCompanyInventoryTransferCommand): PreviewCrossCompanyInventoryTransferCommand {
  const physical = normalizePhysical(command);
  return Object.freeze({
    ...command,
    sourceCompanyId: physical.sourceCompanyId,
    destinationCompanyId: physical.destinationCompanyId,
    effectiveDate: physical.effectiveDate,
    lines: Object.freeze(physical.lines.map((line) => Object.freeze({
      sourceProductId: line.sourceProductId,
      destinationProductId: line.destinationProductId,
      quantity: line.quantity.amount,
      unit: line.quantity.unit,
    }))),
  });
}

function normalizePhysical(command: Pick<PreviewCrossCompanyInventoryTransferCommand, "actorUserId" | "organizationId" | "sourceCompanyId" | "destinationCompanyId" | "effectiveDate" | "lines">): {
  readonly sourceCompanyId: CompanyId;
  readonly destinationCompanyId: CompanyId;
  readonly effectiveDate: ReturnType<typeof localDate>;
  readonly lines: readonly { readonly sourceProductId: ProductId; readonly destinationProductId: ProductId; readonly quantity: ReturnType<typeof quantity> }[];
} {
  if (!command.actorUserId || !command.organizationId || !command.sourceCompanyId || !command.destinationCompanyId || command.sourceCompanyId === command.destinationCompanyId) {
    invalid("The cross-company transfer scope is invalid.");
  }
  const lines = crossCompanyInventoryTransferLines(command.lines.map((line) => {
    if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/.test(line.quantity)) {
      invalid("Cross-company transfer quantities require at most ten integer digits and four decimal places.");
    }
    return { sourceProductId: line.sourceProductId, destinationProductId: line.destinationProductId, quantity: quantity(line.quantity, line.unit) };
  }));
  return {
    sourceCompanyId: command.sourceCompanyId,
    destinationCompanyId: command.destinationCompanyId,
    effectiveDate: localDate(command.effectiveDate),
    lines,
  };
}

function assertPreview(
  command: PreviewCrossCompanyInventoryTransferCommand,
  preview: CrossCompanyInventoryTransferPreview,
): CrossCompanyInventoryTransferPreview {
  if (preview.sourceCompanyId !== command.sourceCompanyId || preview.destinationCompanyId !== command.destinationCompanyId) {
    invalid("Persistence returned a cross-company transfer preview for another company.");
  }
  return Object.freeze({
    sourceCompanyId: preview.sourceCompanyId,
    destinationCompanyId: preview.destinationCompanyId,
    sourceSnapshotToken: snapshotToken(preview.sourceSnapshotToken, "source"),
    destinationSnapshotToken: snapshotToken(preview.destinationSnapshotToken, "destination"),
  });
}

function assertReceipt(
  command: ExecuteCrossCompanyInventoryTransferCommand,
  receipt: CrossCompanyInventoryTransferReceipt,
): CrossCompanyInventoryTransferReceipt {
  if (receipt.transferId !== command.transferId
    || receipt.sourceCompanyId !== command.sourceCompanyId
    || receipt.destinationCompanyId !== command.destinationCompanyId
    || !validIdentifier(receipt.sourceOperationId)
    || !validIdentifier(receipt.destinationOperationId)
    || receipt.sourceOperationId === receipt.destinationOperationId
    || typeof receipt.replayed !== "boolean") {
    invalid("Persistence returned an invalid cross-company transfer receipt.");
  }
  return Object.freeze({ ...receipt });
}

function snapshotToken(value: string, side: string): string {
  return boundedText(value, `${side} inventory snapshot token`, 256);
}

function boundedText(value: string, label: string, maximum: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/.test(normalized)) {
    invalid(`The cross-company transfer ${label} is invalid.`);
  }
  return normalized;
}

function validIdentifier(value: string): boolean {
  return typeof value === "string" && !!value.trim() && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value);
}

function invalid(message: string): never {
  throw new InventoryFailure("INVENTORY_CROSS_COMPANY_TRANSFER_INVALID", message);
}

async function repositoryCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof InventoryFailure) throw cause;
    throw new InventoryFailure("INVENTORY_REPOSITORY_UNAVAILABLE", "Inventory repository is unavailable.", { cause });
  }
}
