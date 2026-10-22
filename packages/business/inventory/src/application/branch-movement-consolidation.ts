import type { ExactDecimal } from "@kontave/monetary/domain";
import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";

/** One source-document kind that can create a branch-attributed inventory movement. */
export type InventoryBranchMovementSourceType = "purchase" | "sale" | "manual" | "historical";

/** Filters for a tenant-scoped inventory movement consolidation by source-document branch. */
export interface InventoryBranchMovementConsolidationQuery {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly from: string;
  readonly to: string;
  readonly branchIds?: readonly string[];
}

/** One exact, unit-safe inventory movement aggregate. */
export interface InventoryBranchMovementConsolidationRow {
  readonly branchId: string;
  readonly branchCode: string;
  readonly branchName: string;
  readonly sourceType: InventoryBranchMovementSourceType;
  readonly productId: string;
  readonly productName: string;
  readonly measureUnit: string;
  readonly movementType: string;
  readonly movementCount: number;
  readonly quantity: ExactDecimal;
  readonly totalCostVes: ExactDecimal;
}

/** Coverage metadata that keeps unassigned historical data visible. */
export interface InventoryBranchMovementConsolidationCoverage {
  readonly attributedMovementCount: number;
  readonly linkedWithoutBranchMovementCount: number | null;
  readonly unlinkedMovementCount: number | null;
  readonly includesCompanyWideCoverage: boolean;
}

/** Immutable, tenant-scoped inventory movement consolidation response. */
export interface InventoryBranchMovementConsolidation {
  readonly period: { readonly from: string; readonly to: string };
  readonly rows: readonly InventoryBranchMovementConsolidationRow[];
  readonly coverage: InventoryBranchMovementConsolidationCoverage;
  readonly generatedAt: string;
}

/** Read port for source-document branch consolidation of inventory movements. */
export interface InventoryBranchMovementConsolidationReader {
  /**
   * @param query - Validated actor scope, civil period, and optional branch filter.
   * @returns An immutable source-document inventory movement consolidation.
   * @throws {InventoryBranchMovementConsolidationFailure} When access or persistence fails.
   */
  read(query: InventoryBranchMovementConsolidationQuery): Promise<InventoryBranchMovementConsolidation>;
}

/** Expected failure exposed by branch movement consolidation. */
export class InventoryBranchMovementConsolidationFailure extends Error {
  /**
   * Creates a stable error suitable for transport-boundary handling.
   * @param code - Stable machine-readable reason for the failed request.
   * @param message - Safe diagnostic message.
   * @param options - Optional underlying failure retained for observability.
   * @returns A typed inventory branch movement consolidation error.
   */
  constructor(
    readonly code:
      | "INVENTORY_BRANCH_MOVEMENT_CONSOLIDATION_INVALID"
      | "INVENTORY_BRANCH_MOVEMENT_CONSOLIDATION_ACCESS_DENIED"
      | "INVENTORY_BRANCH_MOVEMENT_CONSOLIDATION_UNAVAILABLE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "InventoryBranchMovementConsolidationFailure";
  }
}

/** Loads source-document inventory movement totals without combining distinct measure units. */
export class GetInventoryBranchMovementConsolidation {
  /**
   * Creates the inventory branch movement consolidation use case.
   * @param reader - Tenant-aware query port for the authoritative consolidation.
   * @returns A use case that validates and executes consolidation queries.
   */
  constructor(private readonly reader: InventoryBranchMovementConsolidationReader) {}

  /**
   * @param query - Actor scope, inclusive civil date range, and optional branch filters.
   * @returns The immutable, unit-safe consolidation and coverage metadata.
   * @throws {InventoryBranchMovementConsolidationFailure} When validation or the read fails.
   */
  async execute(
    query: InventoryBranchMovementConsolidationQuery,
  ): Promise<InventoryBranchMovementConsolidation> {
    const valid = validateInventoryBranchMovementConsolidationQuery(query);
    try {
      return await this.reader.read(valid);
    } catch (cause: unknown) {
      if (cause instanceof InventoryBranchMovementConsolidationFailure) throw cause;
      throw new InventoryBranchMovementConsolidationFailure(
        "INVENTORY_BRANCH_MOVEMENT_CONSOLIDATION_UNAVAILABLE",
        "Inventory branch movement consolidation is unavailable.",
        { cause },
      );
    }
  }
}

/**
 * Validates and makes immutable a branch movement consolidation query.
 * @param query - Untrusted tenant scope, inclusive dates, and optional branch filter.
 * @returns A normalized immutable query.
 * @throws {InventoryBranchMovementConsolidationFailure} When period or branch IDs are invalid.
 */
export function validateInventoryBranchMovementConsolidationQuery(
  query: InventoryBranchMovementConsolidationQuery,
): InventoryBranchMovementConsolidationQuery {
  if (!query || typeof query !== "object") throw invalid("Consolidation query is required.");
  requireScopeValue(query.actorUserId, "Actor user ID");
  requireScopeValue(query.organizationId, "Organization ID");
  requireScopeValue(query.companyId, "Company ID");
  const from = civilDate(query.from);
  const to = civilDate(query.to);
  if (from > to) throw invalid("Consolidation start date must not be after its end date.");
  const days = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > 366) throw invalid("Consolidation periods cannot exceed 366 days.");

  const branchIds = query.branchIds === undefined ? undefined : normalizeBranchIds(query.branchIds);
  return Object.freeze({ ...query, from, to, ...(branchIds === undefined ? {} : { branchIds }) });
}

function normalizeBranchIds(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value)) throw invalid("Branch IDs must be an array.");
  if (value.length > 100) throw invalid("A maximum of 100 branch IDs can be requested.");
  const identifiers = value.map((branchId) => branchId.trim());
  if (identifiers.some((branchId) => !uuid.test(branchId))) {
    throw invalid("Every branch ID must be a UUID.");
  }
  if (new Set(identifiers).size !== identifiers.length) {
    throw invalid("Branch IDs must be distinct.");
  }
  return Object.freeze(identifiers);
}

function requireScopeValue(value: unknown, label: string): void {
  if (typeof value !== "string" || !value.trim()) throw invalid(`${label} is required.`);
}

function civilDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid("Consolidation dates must use YYYY-MM-DD format.");
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw invalid("Consolidation date is invalid.");
  }
  return value;
}

function invalid(message: string): InventoryBranchMovementConsolidationFailure {
  return new InventoryBranchMovementConsolidationFailure(
    "INVENTORY_BRANCH_MOVEMENT_CONSOLIDATION_INVALID",
    message,
  );
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
