import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import {
  crossCompanyInventoryTransferId,
  crossCompanyInventoryTransferLines,
  InventoryFailure,
  localDate,
  quantity,
  type CrossCompanyInventoryTransferId,
} from "../domain";
import type { CrossCompanyInventoryTransferCommandLine } from "./cross-company-transfer";

/** Read-only request to inspect whether one posted transfer can be physically compensated. */
export interface PreviewCrossCompanyInventoryCompensationCommand {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly originalTransferId: CrossCompanyInventoryTransferId;
  readonly effectiveDate: string;
}

/** Pinned physical lines for a compensation; values are priced at current average cost on execution. */
export interface CrossCompanyInventoryCompensationPreview {
  readonly originalTransferId: CrossCompanyInventoryTransferId;
  readonly sourceCompanyId: CompanyId;
  readonly destinationCompanyId: CompanyId;
  readonly effectiveDate: string;
  readonly lines: readonly CrossCompanyInventoryTransferCommandLine[];
  readonly sourceSnapshotToken: string;
  readonly destinationSnapshotToken: string;
}

/** Command that creates an immutable, paired physical compensation for an original transfer. */
export interface ExecuteCrossCompanyInventoryCompensationCommand extends PreviewCrossCompanyInventoryCompensationCommand {
  readonly compensationTransferId: CrossCompanyInventoryTransferId;
  readonly idempotencyKey: string;
  readonly reason: string;
  readonly expectedSourceSnapshotToken: string;
  readonly expectedDestinationSnapshotToken: string;
}

/** Receipt of a new physical inverse movement; it never removes or rewrites the original transfer. */
export interface CrossCompanyInventoryCompensationReceipt {
  readonly originalTransferId: CrossCompanyInventoryTransferId;
  readonly compensationTransferId: CrossCompanyInventoryTransferId;
  readonly sourceCompanyId: CompanyId;
  readonly destinationCompanyId: CompanyId;
  readonly sourceOperationId: string;
  readonly destinationOperationId: string;
  readonly replayed: boolean;
}

/** Atomic, server-authorized persistence boundary for paired physical compensations. */
export interface CrossCompanyInventoryCompensationRepository {
  /**
   * Returns the original mapped quantities and exact current-state preconditions without writing.
   * @param command - Actor scope, original transfer identity, and compensation effective date.
   * @returns Original identities, physical lines, and opaque snapshot tokens.
   * @throws {InventoryFailure} When the original is missing, immutable, already compensated, or inaccessible.
   */
  preview(command: PreviewCrossCompanyInventoryCompensationCommand): Promise<CrossCompanyInventoryCompensationPreview>;
  /**
   * Posts a new inverse physical transfer using current inventory valuation, never an accounting reversal.
   * @param command - Preview-pinned compensation request with reason and idempotency key.
   * @returns Paired operation receipt or the receipt for an identical retry.
   * @throws {InventoryFailure} When snapshots drift, stock/period/valuation conditions fail, or the original cannot be compensated.
   */
  execute(command: ExecuteCrossCompanyInventoryCompensationCommand): Promise<CrossCompanyInventoryCompensationReceipt>;
}

/** Previews the only supported physical compensation for one original company-to-company transfer. */
export class PreviewCrossCompanyInventoryCompensation {
  /** @param repository - Read-only compensation preview port. */
  constructor(private readonly repository: Pick<CrossCompanyInventoryCompensationRepository, "preview">) {}

  /**
   * @param command - Actor scope, original transfer, and date for the new physical movement.
   * @returns Pinned original lines and tokens for a subsequent execute request.
   * @throws {InventoryFailure} When the original or returned preview is invalid.
   */
  async execute(command: PreviewCrossCompanyInventoryCompensationCommand): Promise<CrossCompanyInventoryCompensationPreview> {
    const normalized = normalizePreviewCommand(command);
    return assertPreview(normalized, await call(() => this.repository.preview(normalized)));
  }
}

/** Posts a new, paired inverse transfer that preserves the original transfer audit history. */
export class ExecuteCrossCompanyInventoryCompensation {
  /** @param repository - Atomic compensation writer. */
  constructor(private readonly repository: Pick<CrossCompanyInventoryCompensationRepository, "execute">) {}

  /**
   * @param command - Original identity, new compensation identity, tokens, reason, and idempotency key.
   * @returns Durable paired-compensation receipt.
   * @throws {InventoryFailure} When the request, response, or database invariant is invalid.
   */
  async execute(command: ExecuteCrossCompanyInventoryCompensationCommand): Promise<CrossCompanyInventoryCompensationReceipt> {
    const normalized = normalizeExecuteCommand(command);
    return assertReceipt(normalized, await call(() => this.repository.execute(normalized)));
  }
}

function normalizePreviewCommand(command: PreviewCrossCompanyInventoryCompensationCommand): PreviewCrossCompanyInventoryCompensationCommand {
  if (!command.actorUserId || !command.organizationId) invalid("The compensation scope is invalid.");
  return Object.freeze({ ...command, originalTransferId: crossCompanyInventoryTransferId(command.originalTransferId), effectiveDate: localDate(command.effectiveDate) });
}

function normalizeExecuteCommand(command: ExecuteCrossCompanyInventoryCompensationCommand): ExecuteCrossCompanyInventoryCompensationCommand {
  const preview = normalizePreviewCommand(command);
  const compensationTransferId = crossCompanyInventoryTransferId(command.compensationTransferId);
  if (compensationTransferId === preview.originalTransferId) invalid("The compensation transfer must have a new identity.");
  return Object.freeze({ ...preview, compensationTransferId, idempotencyKey: text(command.idempotencyKey, "idempotency key", 128), reason: text(command.reason, "reason", 500), expectedSourceSnapshotToken: text(command.expectedSourceSnapshotToken, "source snapshot token", 256), expectedDestinationSnapshotToken: text(command.expectedDestinationSnapshotToken, "destination snapshot token", 256) });
}

function assertPreview(command: PreviewCrossCompanyInventoryCompensationCommand, value: CrossCompanyInventoryCompensationPreview): CrossCompanyInventoryCompensationPreview {
  if (value.originalTransferId !== command.originalTransferId || !value.sourceCompanyId || !value.destinationCompanyId || value.sourceCompanyId === value.destinationCompanyId || value.effectiveDate !== command.effectiveDate) invalid("Persistence returned an invalid compensation preview.");
  const lines = crossCompanyInventoryTransferLines(value.lines.map((line) => ({ sourceProductId: line.sourceProductId, destinationProductId: line.destinationProductId, quantity: quantity(line.quantity, line.unit) }))).map((line) => Object.freeze({ sourceProductId: line.sourceProductId, destinationProductId: line.destinationProductId, quantity: line.quantity.amount, unit: line.quantity.unit }));
  return Object.freeze({ ...value, lines: Object.freeze(lines), sourceSnapshotToken: text(value.sourceSnapshotToken, "source snapshot token", 256), destinationSnapshotToken: text(value.destinationSnapshotToken, "destination snapshot token", 256) });
}

function assertReceipt(command: ExecuteCrossCompanyInventoryCompensationCommand, value: CrossCompanyInventoryCompensationReceipt): CrossCompanyInventoryCompensationReceipt {
  if (value.originalTransferId !== command.originalTransferId || value.compensationTransferId !== command.compensationTransferId || !value.sourceCompanyId || !value.destinationCompanyId || value.sourceCompanyId === value.destinationCompanyId || !identifier(value.sourceOperationId) || !identifier(value.destinationOperationId) || value.sourceOperationId === value.destinationOperationId || typeof value.replayed !== "boolean") invalid("Persistence returned an invalid compensation receipt.");
  return Object.freeze({ ...value });
}

function text(value: string, label: string, maximum: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/.test(normalized)) invalid(`The compensation ${label} is invalid.`);
  return normalized;
}

function identifier(value: string): boolean { return typeof value === "string" && !!value.trim() && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value); }
function invalid(message: string): never { throw new InventoryFailure("INVENTORY_CROSS_COMPANY_COMPENSATION_INVALID", message); }
async function call<T>(operation: () => Promise<T>): Promise<T> { try { return await operation(); } catch (cause: unknown) { if (cause instanceof InventoryFailure) throw cause; throw new InventoryFailure("INVENTORY_REPOSITORY_UNAVAILABLE", "Inventory compensation repository is unavailable.", { cause }); } }
