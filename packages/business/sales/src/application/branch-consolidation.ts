/** Authorized period query for sales documents grouped across branch assignments. */
export interface SalesBranchConsolidationQuery {
  readonly actorUserId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly from: string;
  readonly to: string;
  /** Omit to consolidate every branch the actor is allowed to read. */
  readonly branchIds?: readonly string[];
}

/** Exact totals for one branch, document kind, and transaction currency. */
export interface SalesBranchConsolidationRow {
  readonly branchId: string;
  readonly branchCode: string;
  readonly branchName: string;
  readonly documentType: string;
  readonly currencyCode: string;
  readonly documentCount: number;
  readonly subtotal: string;
  readonly vatAmount: string;
  readonly total: string;
}

/** Sales coverage explains confirmed records that cannot be assigned to a branch. */
export interface SalesBranchConsolidationCoverage {
  readonly attributedConfirmedDocumentCount: number;
  /** Null for users who may not inspect company-wide unattributed history. */
  readonly unattributedConfirmedDocumentCount: number | null;
  readonly includesUnattributed: boolean;
}

/** Branch-level sales totals with explicit limits on historic attribution. */
export interface SalesBranchConsolidation {
  readonly period: { readonly from: string; readonly to: string };
  readonly rows: readonly SalesBranchConsolidationRow[];
  readonly coverage: SalesBranchConsolidationCoverage;
  readonly generatedAt: string;
}

/** Persistence boundary for a permission-checked multi-branch sales read. */
export interface SalesBranchConsolidationReader {
  /**
   * Reads confirmed sales by accessible branch without converting transaction currencies.
   * @param query - Authenticated actor, company, period, and optional branch filter.
   * @returns Exact grouped totals and attribution coverage.
   * @throws {SalesBranchConsolidationFailure} When scope, authorization, or storage fails.
   */
  read(query: SalesBranchConsolidationQuery): Promise<SalesBranchConsolidation>;
}

/** Stable expected failures for branch sales consolidation. */
export type SalesBranchConsolidationFailureCode =
  | "SALES_BRANCH_CONSOLIDATION_INVALID"
  | "SALES_BRANCH_CONSOLIDATION_ACCESS_DENIED"
  | "SALES_BRANCH_CONSOLIDATION_UNAVAILABLE";

/** Expected failure exposed by the branch consolidation use case and adapter. */
export class SalesBranchConsolidationFailure extends Error {
  /**
   * Creates a typed consolidation failure.
   * @param code - Stable failure code.
   * @param message - Safe explanation suitable for application handling.
   * @param options - Optional underlying cause for diagnostics.
   */
  constructor(readonly code: SalesBranchConsolidationFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SalesBranchConsolidationFailure";
  }
}

/** Executes a validated, authorized sales consolidation over accessible branches. */
export class GetSalesBranchConsolidation {
  /**
   * Creates the consolidation query service.
   * @param reader - Repository that enforces company and branch authorization.
   */
  constructor(private readonly reader: SalesBranchConsolidationReader) {}

  /**
   * Reads a maximum 366-day report period without inferring historical branch ownership.
   * @param query - Actor, company, date range, and optional branch UUIDs.
   * @returns A frozen consolidation snapshot.
   * @throws {SalesBranchConsolidationFailure} When the query or read is rejected.
   */
  async execute(query: SalesBranchConsolidationQuery): Promise<SalesBranchConsolidation> {
    const normalized = validateSalesBranchConsolidationQuery(query);
    try {
      return await this.reader.read(normalized);
    } catch (cause) {
      if (cause instanceof SalesBranchConsolidationFailure) throw cause;
      throw new SalesBranchConsolidationFailure("SALES_BRANCH_CONSOLIDATION_UNAVAILABLE", "Branch sales consolidation is unavailable.", { cause });
    }
  }
}

/**
 * Validates and freezes a branch-consolidation request before persistence.
 * @param query - Caller-supplied report identity, period, and optional branches.
 * @returns A normalized request with sorted unique branch UUIDs.
 * @throws {SalesBranchConsolidationFailure} When identity, dates, period, or branch IDs are invalid.
 */
export function validateSalesBranchConsolidationQuery(query: SalesBranchConsolidationQuery): SalesBranchConsolidationQuery {
  if (typeof query.actorUserId !== "string" || !query.actorUserId.trim()
    || typeof query.organizationId !== "string" || !query.organizationId.trim()
    || typeof query.companyId !== "string" || !query.companyId.trim()) throw invalid("Sales consolidation scope is required.");
  const from = civilDate(query.from);
  const to = civilDate(query.to);
  if (from > to) throw invalid("Sales consolidation start date must not follow its end date.");
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1 > 366) throw invalid("Sales consolidation periods cannot exceed 366 days.");
  if (query.branchIds !== undefined && !Array.isArray(query.branchIds)) throw invalid("Branch filters must be an array of UUIDs.");
  const branchIds = query.branchIds === undefined ? undefined : [...new Set(query.branchIds.map((id) => {
    if (typeof id !== "string" || !uuid.test(id)) throw invalid("Every branch identifier must be a UUID.");
    return id.toLowerCase();
  }))].sort();
  if (branchIds && branchIds.length > 100) throw invalid("At most 100 branches can be requested at once.");
  return Object.freeze({ ...query, from, to, ...(branchIds ? { branchIds: Object.freeze(branchIds) } : {}) });
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function civilDate(value: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid("Sales consolidation dates must use YYYY-MM-DD.");
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) throw invalid("Sales consolidation date is not a valid civil date.");
  return value;
}

function invalid(message: string): SalesBranchConsolidationFailure {
  return new SalesBranchConsolidationFailure("SALES_BRANCH_CONSOLIDATION_INVALID", message);
}
