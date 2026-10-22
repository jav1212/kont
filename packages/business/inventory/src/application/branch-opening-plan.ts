import { addDecimal, compareDecimal, decimalScale, exactDecimal, type ExactDecimal } from "@kontave/monetary/domain";
import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";

/** Tenant-scoped request for the non-posting opening allocation draft of one inventory product. */
export interface InventoryBranchOpeningPlanQuery {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly productId: string;
}

/** One branch allocation in an opening-stock draft. */
export interface InventoryBranchOpeningPlanLine {
  readonly branchId: string;
  readonly quantity: ExactDecimal;
}

/** Durable draft metadata; this is not an active branch stock balance. */
export interface InventoryBranchOpeningPlanDraft {
  readonly revision: number;
  readonly snapshotStockRevision: string;
  readonly snapshotCompanyStock: ExactDecimal;
  readonly totalAllocated: ExactDecimal;
  readonly stale: boolean;
  readonly updatedAt: string;
  readonly lines: readonly (InventoryBranchOpeningPlanLine & { readonly branchCode: string })[];
}

/** Authoritative product stock and its optional branch-allocation draft. */
export interface InventoryBranchOpeningPlan {
  readonly productId: string;
  readonly measureUnit: string;
  readonly companyStock: ExactDecimal;
  readonly stockRevision: string;
  readonly plan: InventoryBranchOpeningPlanDraft | null;
}

/** Optimistic replacement of every allocation line for one product's opening-stock draft. */
export interface ReplaceInventoryBranchOpeningPlanCommand extends InventoryBranchOpeningPlanQuery {
  readonly expectedStockRevision: string;
  readonly expectedPlanRevision: number;
  readonly lines: readonly { readonly branchId: string; readonly quantity: string }[];
}

/** Read port for the server-authorized opening allocation draft. */
export interface InventoryBranchOpeningPlanReader {
  /**
   * @param query - Validated actor, tenant, company, and product scope.
   * @returns The product stock snapshot and optional allocation draft.
   * @throws {InventoryBranchOpeningPlanFailure} When access or persistence fails.
   */
  read(query: InventoryBranchOpeningPlanQuery): Promise<InventoryBranchOpeningPlan>;
}

/** Atomic replacement port for a complete opening allocation draft. */
export interface InventoryBranchOpeningPlanWriter {
  /**
   * @param command - Validated full replacement, including optimistic stock and plan revisions.
   * @returns The authoritative plan after replacement.
   * @throws {InventoryBranchOpeningPlanFailure} When access, stock, allocation, or concurrency fails.
   */
  replace(command: ReplaceInventoryBranchOpeningPlanCommand): Promise<InventoryBranchOpeningPlan>;
}

/** Expected failure exposed by the opening allocation draft capability. */
export class InventoryBranchOpeningPlanFailure extends Error {
  /**
   * @param code - Stable reason for a transport boundary.
   * @param message - Safe diagnostic message.
   * @param options - Optional underlying cause retained for observability.
   * @returns A typed opening-plan failure.
   */
  constructor(
    readonly code:
      | "INVENTORY_BRANCH_OPENING_ACCESS_DENIED"
      | "INVENTORY_BRANCH_OPENING_INVALID"
      | "INVENTORY_BRANCH_OPENING_STOCK_CONFLICT"
      | "INVENTORY_BRANCH_OPENING_PLAN_CONFLICT"
      | "INVENTORY_BRANCH_OPENING_STOCK_NOT_POSITIVE"
      | "INVENTORY_BRANCH_OPENING_SUM_MISMATCH"
      | "INVENTORY_BRANCH_OPENING_UNAVAILABLE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "InventoryBranchOpeningPlanFailure";
  }
}

/** Loads the draft required to reconcile a future branch-stock opening balance. */
export class GetInventoryBranchOpeningPlan {
  /**
   * @param reader - Port that obtains the authoritative, tenant-authorized draft.
   * @returns A use case for reading a product's opening allocation plan.
   */
  constructor(private readonly reader: InventoryBranchOpeningPlanReader) {}

  /**
   * @param query - Untrusted actor and product scope.
   * @returns The immutable stock snapshot and optional draft.
   * @throws {InventoryBranchOpeningPlanFailure} When validation or the read fails.
   */
  async execute(query: InventoryBranchOpeningPlanQuery): Promise<InventoryBranchOpeningPlan> {
    const valid = validateInventoryBranchOpeningPlanQuery(query);
    try {
      return freezePlan(await this.reader.read(valid));
    } catch (cause: unknown) {
      if (cause instanceof InventoryBranchOpeningPlanFailure) throw cause;
      throw unavailable(cause);
    }
  }
}

/** Replaces every opening allocation line after locking the product stock in the persistence adapter. */
export class ReplaceInventoryBranchOpeningPlan {
  /**
   * @param writer - Atomic full-replacement port.
   * @returns A use case that writes a non-posting allocation draft.
   */
  constructor(private readonly writer: InventoryBranchOpeningPlanWriter) {}

  /**
   * @param command - Untrusted complete allocation and optimistic preconditions.
   * @returns The authoritative plan after replacement.
   * @throws {InventoryBranchOpeningPlanFailure} When validation, concurrency, or persistence fails.
   */
  async execute(command: ReplaceInventoryBranchOpeningPlanCommand): Promise<InventoryBranchOpeningPlan> {
    const valid = validateReplaceInventoryBranchOpeningPlanCommand(command);
    try {
      return freezePlan(await this.writer.replace(valid));
    } catch (cause: unknown) {
      if (cause instanceof InventoryBranchOpeningPlanFailure) throw cause;
      throw unavailable(cause);
    }
  }
}

/**
 * Validates and freezes the scope for one product's opening allocation plan.
 * @param query - Untrusted actor, tenant, company, and product values.
 * @returns An immutable normalized query.
 * @throws {InventoryBranchOpeningPlanFailure} When scope is invalid.
 */
export function validateInventoryBranchOpeningPlanQuery(
  query: InventoryBranchOpeningPlanQuery,
): InventoryBranchOpeningPlanQuery {
  if (!query || typeof query !== "object") throw invalid("Opening-plan query is required.");
  requireUuid(query.actorUserId, "Actor user ID");
  requireUuid(query.organizationId, "Organization ID");
  const companyId = text(query.companyId, "Company ID", 128) as CompanyId;
  const productId = text(query.productId, "Product ID", 128);
  return Object.freeze({ actorUserId: query.actorUserId, organizationId: query.organizationId, companyId, productId });
}

/**
 * Validates a complete replacement of a branch opening allocation draft.
 * @param command - Untrusted scope, revisions, and allocation lines.
 * @returns An immutable command containing canonical exact quantities.
 * @throws {InventoryBranchOpeningPlanFailure} When a precondition or allocation is invalid.
 */
export function validateReplaceInventoryBranchOpeningPlanCommand(
  command: ReplaceInventoryBranchOpeningPlanCommand,
): ReplaceInventoryBranchOpeningPlanCommand {
  const scope = validateInventoryBranchOpeningPlanQuery(command);
  const expectedStockRevision = revision(command.expectedStockRevision, "Stock revision");
  if (!Number.isSafeInteger(command.expectedPlanRevision) || command.expectedPlanRevision < 0 || command.expectedPlanRevision > 2_147_483_647) {
    throw invalid("Plan revision must be a non-negative PostgreSQL integer.");
  }
  if (!Array.isArray(command.lines) || command.lines.length < 1 || command.lines.length > 100) {
    throw invalid("Opening allocation requires from one through 100 lines.");
  }
  const branchIds = new Set<string>();
  const lines = command.lines.map((line) => {
    if (!line || typeof line !== "object") throw invalid("Opening allocation line is invalid.");
    const branchId = uuidValue(line.branchId, "Branch ID");
    if (branchIds.has(branchId)) throw invalid("Opening allocation branch IDs must be distinct.");
    branchIds.add(branchId);
    return Object.freeze({ branchId, quantity: canonicalPositiveQuantity(line.quantity) });
  });
  return Object.freeze({
    ...scope,
    expectedStockRevision,
    expectedPlanRevision: command.expectedPlanRevision,
    lines: Object.freeze(lines),
  });
}

/**
 * Freezes and verifies the server response shape required by the portable application contract.
 * @param value - Authoritative response from a persistence adapter.
 * @returns An immutable response with exact canonical decimals.
 * @throws {InventoryBranchOpeningPlanFailure} When the response is inconsistent.
 */
export function freezeInventoryBranchOpeningPlan(value: InventoryBranchOpeningPlan): InventoryBranchOpeningPlan {
  return freezePlan(value);
}

function freezePlan(value: InventoryBranchOpeningPlan): InventoryBranchOpeningPlan {
  if (!value || typeof value !== "object") throw invalid("Opening-plan response is invalid.");
  const productId = text(value.productId, "Response product ID", 128);
  const measureUnit = text(value.measureUnit, "Response measure unit", 64);
  const companyStock = decodeExact(value.companyStock, "Response company stock");
  const stockRevision = revision(value.stockRevision, "Response stock revision");
  if (value.plan === null) return Object.freeze({ productId, measureUnit, companyStock, stockRevision, plan: null });
  const plan = value.plan;
  if (!Number.isSafeInteger(plan.revision) || plan.revision < 1) throw invalid("Response plan revision is invalid.");
  const snapshotStockRevision = revision(plan.snapshotStockRevision, "Response snapshot stock revision");
  const snapshotCompanyStock = decodeExact(plan.snapshotCompanyStock, "Response snapshot company stock");
  const totalAllocated = decodeExact(plan.totalAllocated, "Response total allocated");
  if (typeof plan.stale !== "boolean") throw invalid("Response plan stale state is invalid.");
  const updatedAt = isoDateTime(plan.updatedAt, "Response plan updated time");
  if (!Array.isArray(plan.lines) || plan.lines.length < 1 || plan.lines.length > 100) throw invalid("Response plan lines are invalid.");
  const branchIds = new Set<string>();
  let calculatedTotal = exactDecimal("0");
  const lines = plan.lines.map((line) => {
    const branchId = uuidValue(line.branchId, "Response branch ID");
    if (branchIds.has(branchId)) throw invalid("Response plan branch IDs must be distinct.");
    branchIds.add(branchId);
    const branchCode = text(line.branchCode, "Response branch code", 64);
    const quantity = positiveExact(line.quantity, "Response allocation quantity", false);
    calculatedTotal = addDecimal(calculatedTotal, quantity);
    return Object.freeze({ branchId, branchCode, quantity });
  });
  if (compareDecimal(calculatedTotal, totalAllocated) !== 0) throw invalid("Response allocation total is inconsistent.");
  if (compareDecimal(totalAllocated, snapshotCompanyStock) !== 0) {
    throw invalid("Response allocation total must equal the plan stock snapshot.");
  }
  if (plan.stale !== (snapshotStockRevision !== stockRevision)) {
    throw invalid("Response plan stale state does not match stock revisions.");
  }
  return Object.freeze({
    productId,
    measureUnit,
    companyStock,
    stockRevision,
    plan: Object.freeze({
      revision: plan.revision,
      snapshotStockRevision,
      snapshotCompanyStock,
      totalAllocated,
      stale: plan.stale,
      updatedAt,
      lines: Object.freeze(lines),
    }),
  });
}

function canonicalPositiveQuantity(value: unknown): ExactDecimal {
  if (typeof value !== "string") throw invalid("Opening allocation quantity must be text.");
  return positiveExact(value, "Opening allocation quantity", true);
}

function positiveExact(value: unknown, label: string, requireCanonical: boolean): ExactDecimal {
  const parsed = requireCanonical ? canonicalExact(value, label) : decodeExact(value, label);
  if (decimalScale(parsed) > 4 || compareDecimal(parsed, exactDecimal("0")) <= 0) {
    throw invalid(`${label} must be positive with at most four decimal places.`);
  }
  return parsed;
}

function canonicalExact(value: unknown, label: string): ExactDecimal {
  if (typeof value !== "string" || value.trim() !== value) throw invalid(`${label} must be canonical decimal text.`);
  try {
    const parsed = exactDecimal(value);
    if (parsed !== value) throw invalid(`${label} must be canonical decimal text.`);
    return parsed;
  } catch (cause: unknown) {
    if (cause instanceof InventoryBranchOpeningPlanFailure) throw cause;
    throw invalid(`${label} must be canonical decimal text.`);
  }
}

/** Decodes a PostgreSQL numeric text response, including its valid fixed-scale form such as `2.0000`. */
function decodeExact(value: unknown, label: string): ExactDecimal {
  if (typeof value !== "string" || value.trim() !== value) throw invalid(`${label} must be decimal text.`);
  try {
    return exactDecimal(value);
  } catch (_cause: unknown) {
    throw invalid(`${label} must be decimal text.`);
  }
}

function revision(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value) || BigInt(value) > 9223372036854775807n) {
    throw invalid(`${label} must be a PostgreSQL bigint string.`);
  }
  return value;
}

function isoDateTime(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    throw invalid(`${label} must be an ISO timestamp.`);
  }
  return value;
}

function text(value: unknown, label: string, max: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) throw invalid(`${label} is invalid.`);
  return normalized;
}

function requireUuid(value: unknown, label: string): void {
  uuidValue(value, label);
}

function uuidValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !uuid.test(value)) throw invalid(`${label} must be a UUID.`);
  return value;
}

function invalid(message: string): InventoryBranchOpeningPlanFailure {
  return new InventoryBranchOpeningPlanFailure("INVENTORY_BRANCH_OPENING_INVALID", message);
}

function unavailable(cause: unknown): InventoryBranchOpeningPlanFailure {
  return new InventoryBranchOpeningPlanFailure(
    "INVENTORY_BRANCH_OPENING_UNAVAILABLE",
    "Inventory branch opening allocation is unavailable.",
    { cause },
  );
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
