import type { CompanyId } from "@kontave/companies/domain";
import type { ExactDecimal } from "@kontave/monetary/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";

/** Input used to inspect whether a company's inventory history can support branch-stock activation. */
export interface InventoryBranchStockReadinessQuery {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly mismatchSampleLimit?: number;
}

/** One product whose current stock differs from the known signed movement history. */
export interface InventoryBranchStockMismatch {
  readonly productId: string;
  readonly code: string;
  readonly measureUnit: string;
  readonly currentStock: ExactDecimal;
  readonly signedMovementQuantity: ExactDecimal;
  readonly difference: ExactDecimal;
}

/** Immutable tenant-scoped diagnostic; it neither represents physical stock by branch nor enables it. */
export interface InventoryBranchStockReadiness {
  readonly totalProducts: number;
  readonly nonzeroStockProducts: number;
  readonly movementReconciliationMismatchProducts: number;
  readonly linkedWithoutBranchMovementCount: number;
  readonly unlinkedMovementCount: number;
  readonly attributedMovementCount: number;
  readonly unsupportedMovementCount: number;
  readonly branchCount: number;
  readonly mismatches: readonly InventoryBranchStockMismatch[];
  readonly generatedAt: string;
}

/** Read port for the server-authorized branch-stock readiness diagnostic. */
export interface InventoryBranchStockReadinessReader {
  /**
   * @param query - Validated actor and full tenant scope with a bounded sample limit.
   * @returns An immutable diagnostic of inventory-history readiness.
   * @throws {InventoryBranchStockReadinessFailure} When authorization or the source fails.
   */
  read(query: InventoryBranchStockReadinessQuery): Promise<InventoryBranchStockReadiness>;
}

/** Expected failure exposed when loading the branch-stock readiness diagnostic. */
export class InventoryBranchStockReadinessFailure extends Error {
  /**
   * @param code - Stable reason suitable for transport-boundary mapping.
   * @param message - Safe diagnostic message.
   * @param options - Optional underlying cause retained for observability.
   * @returns A typed readiness diagnostic failure.
   */
  constructor(
    readonly code:
      | "INVENTORY_BRANCH_STOCK_READINESS_INVALID"
      | "INVENTORY_BRANCH_STOCK_READINESS_ACCESS_DENIED"
      | "INVENTORY_BRANCH_STOCK_READINESS_UNAVAILABLE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "InventoryBranchStockReadinessFailure";
  }
}

/** Loads the diagnostic required before any future physical branch-stock migration. */
export class GetInventoryBranchStockReadiness {
  /**
   * @param reader - Port that obtains the authoritative, tenant-authorized diagnostic.
   * @returns A use case that validates and loads readiness data.
   */
  constructor(private readonly reader: InventoryBranchStockReadinessReader) {}

  /**
   * @param query - Untrusted actor scope and optional mismatch sample limit.
   * @returns The immutable readiness diagnostic.
   * @throws {InventoryBranchStockReadinessFailure} When validation or the diagnostic query fails.
   */
  async execute(query: InventoryBranchStockReadinessQuery): Promise<InventoryBranchStockReadiness> {
    const valid = validateInventoryBranchStockReadinessQuery(query);
    try {
      return await this.reader.read(valid);
    } catch (cause: unknown) {
      if (cause instanceof InventoryBranchStockReadinessFailure) throw cause;
      throw new InventoryBranchStockReadinessFailure(
        "INVENTORY_BRANCH_STOCK_READINESS_UNAVAILABLE",
        "Inventory branch-stock readiness diagnostic is unavailable.",
        { cause },
      );
    }
  }
}

/**
 * Validates and freezes a branch-stock readiness query.
 * @param query - Untrusted tenant scope and optional requested sample size.
 * @returns A normalized immutable query with an explicit bounded sample size.
 * @throws {InventoryBranchStockReadinessFailure} When any identifier or limit is invalid.
 */
export function validateInventoryBranchStockReadinessQuery(
  query: InventoryBranchStockReadinessQuery,
): InventoryBranchStockReadinessQuery {
  if (!query || typeof query !== "object") throw invalid("Readiness query is required.");
  requireUuid(query.actorUserId, "Actor user ID");
  requireUuid(query.organizationId, "Organization ID");
  if (typeof query.companyId !== "string" || !query.companyId.trim()) throw invalid("Company ID is required.");
  const mismatchSampleLimit = query.mismatchSampleLimit ?? 25;
  if (!Number.isInteger(mismatchSampleLimit) || mismatchSampleLimit < 1 || mismatchSampleLimit > 100) {
    throw invalid("Mismatch sample limit must be an integer from 1 through 100.");
  }
  return Object.freeze({
    actorUserId: query.actorUserId,
    organizationId: query.organizationId,
    companyId: query.companyId,
    mismatchSampleLimit,
  });
}

function requireUuid(value: unknown, label: string): void {
  if (typeof value !== "string" || !uuid.test(value)) throw invalid(`${label} must be a UUID.`);
}

function invalid(message: string): InventoryBranchStockReadinessFailure {
  return new InventoryBranchStockReadinessFailure("INVENTORY_BRANCH_STOCK_READINESS_INVALID", message);
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
