import { compareDecimal, decimalScale, exactDecimal, type ExactDecimal } from "@kontave/monetary/domain";
import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";

/** A manual inventory adjustment that is attributed to exactly one branch. */
export type InventoryBranchAdjustmentType = "ajuste_positivo" | "ajuste_negativo" | "autoconsumo";

/** Command for an atomic, idempotent branch-attributed manual inventory adjustment. */
export interface RecordInventoryBranchAdjustmentCommand {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly branchId: string;
  readonly productId: string;
  readonly type: InventoryBranchAdjustmentType;
  readonly date: string;
  readonly quantity: string;
  readonly unit: string;
  readonly unitCostVes: string | null;
  readonly reference: string;
  readonly idempotencyKey: string;
}

/** Immutable authoritative result for one manual branch inventory adjustment. */
export interface InventoryBranchAdjustment {
  readonly movementId: string;
  readonly branchId: string;
  readonly companyId: string;
  readonly productId: string;
  readonly type: InventoryBranchAdjustmentType;
  readonly date: string;
  readonly quantity: ExactDecimal;
  readonly unit: string;
  /** Cost assigned by the authoritative valuation engine, including outbound movements. */
  readonly unitCostVes: ExactDecimal;
  /** Rounded authoritative movement value in VES. */
  readonly totalCostVes: ExactDecimal;
  readonly globalBalance: ExactDecimal;
  readonly stockRevision: string;
}

/** Write port for an atomic manual adjustment owned by the inventory application layer. */
export interface InventoryBranchAdjustmentWriter {
  /**
   * @param command - A validated and canonical adjustment command.
   * @returns The authoritative immutable movement snapshot.
   * @throws {InventoryBranchAdjustmentFailure} When the command cannot be recorded.
   */
  record(command: RecordInventoryBranchAdjustmentCommand): Promise<InventoryBranchAdjustment>;
}

/** Expected error for branch-attributed manual adjustment operations. */
export class InventoryBranchAdjustmentFailure extends Error {
  /**
   * @param code - Stable reason appropriate for a transport boundary.
   * @param message - Safe diagnostic text.
   * @param options - Optional retained underlying cause.
   * @returns A typed inventory adjustment failure.
   */
  constructor(
    readonly code:
      | "INVENTORY_BRANCH_ADJUSTMENT_INVALID"
      | "INVENTORY_BRANCH_ADJUSTMENT_ACCESS_DENIED"
      | "INVENTORY_BRANCH_ADJUSTMENT_PERIOD_CLOSED"
      | "INVENTORY_BRANCH_ADJUSTMENT_STOCK_INSUFFICIENT"
      | "INVENTORY_BRANCH_ADJUSTMENT_IDEMPOTENCY_CONFLICT"
      | "INVENTORY_BRANCH_ADJUSTMENT_PRODUCT_UNAVAILABLE"
      | "INVENTORY_BRANCH_ADJUSTMENT_UNAVAILABLE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "InventoryBranchAdjustmentFailure";
  }
}

/** Records a manual branch adjustment after validating all portable invariants. */
export class RecordInventoryBranchAdjustment {
  /**
   * @param writer - Port that atomically records and attributes the adjustment.
   * @returns A use case for manual branch inventory adjustments.
   */
  constructor(private readonly writer: InventoryBranchAdjustmentWriter) {}

  /**
   * @param command - Untrusted adjustment input.
   * @returns The authoritative immutable movement result.
   * @throws {InventoryBranchAdjustmentFailure} When validation or recording fails.
   */
  async execute(command: RecordInventoryBranchAdjustmentCommand): Promise<InventoryBranchAdjustment> {
    const valid = validateRecordInventoryBranchAdjustmentCommand(command);
    try {
      return freezeInventoryBranchAdjustment(await this.writer.record(valid));
    } catch (cause: unknown) {
      if (cause instanceof InventoryBranchAdjustmentFailure) throw cause;
      throw unavailable(cause);
    }
  }
}

/**
 * Validates and freezes the command without doing persistence or authorization work.
 * @param command - Untrusted manual adjustment input.
 * @returns Canonical immutable input suitable for the write port.
 * @throws {InventoryBranchAdjustmentFailure} When a portable invariant is violated.
 */
export function validateRecordInventoryBranchAdjustmentCommand(
  command: RecordInventoryBranchAdjustmentCommand,
): RecordInventoryBranchAdjustmentCommand {
  if (!command || typeof command !== "object") throw invalid("Adjustment command is required.");
  const actorUserId = uuidValue(command.actorUserId, "Actor user ID") as UserId;
  const organizationId = uuidValue(command.organizationId, "Organization ID") as OrganizationId;
  const branchId = uuidValue(command.branchId, "Branch ID");
  const companyId = text(command.companyId, "Company ID", 128) as CompanyId;
  const productId = text(command.productId, "Product ID", 128);
  if (!adjustmentTypes.has(command.type)) throw invalid("Adjustment type is invalid.");
  const date = civilDate(command.date);
  const quantity = positiveCanonical(command.quantity, "Quantity");
  const unit = text(command.unit, "Unit", 64);
  const reference = optionalText(command.reference, "Reference", 160);
  const idempotencyKey = text(command.idempotencyKey, "Idempotency key", 128);
  const unitCostVes = command.unitCostVes === null ? null : nonNegativeCanonical(command.unitCostVes, "Unit cost");
  if (command.type === "ajuste_positivo" && unitCostVes === null) throw invalid("Positive adjustments require a unit cost.");
  if (command.type !== "ajuste_positivo" && unitCostVes !== null) throw invalid("Outbound adjustments must not include a unit cost.");
  return Object.freeze({ actorUserId, organizationId, companyId, branchId, productId, type: command.type, date, quantity, unit, unitCostVes, reference, idempotencyKey });
}

/**
 * Validates a persistence result before exposing it to a consumer.
 * @param value - Untrusted authoritative response from the persistence adapter.
 * @returns A frozen exact-decimal result.
 * @throws {InventoryBranchAdjustmentFailure} When the response violates the contract.
 */
export function freezeInventoryBranchAdjustment(value: InventoryBranchAdjustment): InventoryBranchAdjustment {
  if (!value || typeof value !== "object") throw invalid("Adjustment response is invalid.");
  const movementId = uuidValue(value.movementId, "Response movement ID");
  const branchId = uuidValue(value.branchId, "Response branch ID");
  const companyId = text(value.companyId, "Response company ID", 128);
  const productId = text(value.productId, "Response product ID", 128);
  if (!adjustmentTypes.has(value.type)) throw invalid("Response adjustment type is invalid.");
  const date = civilDate(value.date);
  const quantity = positiveDecimal(value.quantity, "Response quantity");
  const unit = text(value.unit, "Response unit", 64);
  const globalBalance = decodeDecimal(value.globalBalance, "Response global balance");
  const stockRevision = revision(value.stockRevision);
  const unitCostVes = nonNegativeDecimal(value.unitCostVes, "Response unit cost");
  const totalCostVes = nonNegativeDecimal(value.totalCostVes, "Response total cost");
  return Object.freeze({ movementId, branchId, companyId, productId, type: value.type, date, quantity, unit, unitCostVes, totalCostVes, globalBalance, stockRevision });
}

function canonicalDecimal(value: unknown, label: string): ExactDecimal {
  if (typeof value !== "string" || value.trim() !== value) throw invalid(`${label} must be canonical decimal text.`);
  try { const parsed = exactDecimal(value); if (parsed !== value) throw invalid(`${label} must be canonical decimal text.`); return parsed; }
  catch (cause: unknown) { if (cause instanceof InventoryBranchAdjustmentFailure) throw cause; throw invalid(`${label} must be canonical decimal text.`); }
}
function positiveCanonical(value: unknown, label: string): ExactDecimal { const parsed = canonicalDecimal(value, label); return positiveDecimal(parsed, label); }
function nonNegativeCanonical(value: unknown, label: string): ExactDecimal { const parsed = canonicalDecimal(value, label); return nonNegativeDecimal(parsed, label); }
function decodeDecimal(value: unknown, label: string): ExactDecimal { if (typeof value !== "string" || value.trim() !== value) throw invalid(`${label} must be decimal text.`); try { return exactDecimal(value); } catch { throw invalid(`${label} must be decimal text.`); } }
function positiveDecimal(value: unknown, label: string): ExactDecimal { const parsed = decodeDecimal(value, label); if (decimalScale(parsed) > 4 || compareDecimal(parsed, exactDecimal("0")) <= 0) throw invalid(`${label} must be positive with at most four decimal places.`); return parsed; }
function nonNegativeDecimal(value: unknown, label: string): ExactDecimal { const parsed = decodeDecimal(value, label); if (decimalScale(parsed) > 4 || compareDecimal(parsed, exactDecimal("0")) < 0) throw invalid(`${label} must be non-negative with at most four decimal places.`); return parsed; }
function revision(value: unknown): string { if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value) || BigInt(value) > 9223372036854775807n) throw invalid("Response stock revision is invalid."); return value; }
function civilDate(value: unknown): string { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid("Adjustment date must use YYYY-MM-DD format."); const [year, month, day] = value.split("-").map(Number) as [number, number, number]; const parsed = new Date(Date.UTC(year, month - 1, day)); if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw invalid("Adjustment date is invalid."); return value; }
function text(value: unknown, label: string, max: number): string { const normalized = typeof value === "string" ? value.trim() : ""; if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) throw invalid(`${label} is invalid.`); return normalized; }
function optionalText(value: unknown, label: string, max: number): string { if (typeof value !== "string") throw invalid(`${label} is invalid.`); const normalized = value.trim(); if (normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) throw invalid(`${label} is invalid.`); return normalized; }
function uuidValue(value: unknown, label: string): string { if (typeof value !== "string" || !uuid.test(value)) throw invalid(`${label} must be a UUID.`); return value; }
function invalid(message: string): InventoryBranchAdjustmentFailure { return new InventoryBranchAdjustmentFailure("INVENTORY_BRANCH_ADJUSTMENT_INVALID", message); }
function unavailable(cause: unknown): InventoryBranchAdjustmentFailure { return new InventoryBranchAdjustmentFailure("INVENTORY_BRANCH_ADJUSTMENT_UNAVAILABLE", "Inventory branch adjustment is unavailable.", { cause }); }
const adjustmentTypes = new Set<InventoryBranchAdjustmentType>(["ajuste_positivo", "ajuste_negativo", "autoconsumo"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
