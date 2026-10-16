import type { CompanyId } from "@kontave/companies/domain";
import type { CurrencyCode, ExactDecimal } from "@kontave/monetary/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";

/** Authorized period query for purchase documents grouped by their assigned branch. */
export interface PurchaseBranchConsolidationQuery {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly from: string;
  readonly to: string;
  /** Omit to consolidate every branch the actor is permitted to read. */
  readonly branchIds?: readonly string[];
}

/** Exact functional totals for one branch, document kind, and document currency. */
export interface PurchaseBranchConsolidationRow {
  readonly branchId: string;
  readonly branchCode: string;
  readonly branchName: string;
  readonly documentType: string;
  /** Currency declared on the source document; it does not describe the grouped totals. */
  readonly transactionCurrencyCode: CurrencyCode;
  readonly documentCount: number;
  readonly functionalSubtotal: ExactDecimal;
  readonly functionalVatAmount: ExactDecimal;
  readonly functionalTotal: ExactDecimal;
  readonly functionalCurrency: "VES";
}

/** Coverage makes confirmed documents without a branch visible without adding them to totals. */
export interface PurchaseBranchConsolidationCoverage {
  readonly attributedConfirmedDocumentCount: number;
  /** `null` when the actor may not inspect company-wide unattributed history. */
  readonly unattributedConfirmedDocumentCount: number | null;
  readonly includesUnattributed: boolean;
}

/** Branch-level functional purchase totals and explicit historic-attribution coverage. */
export interface PurchaseBranchConsolidation {
  readonly period: { readonly from: string; readonly to: string };
  readonly rows: readonly PurchaseBranchConsolidationRow[];
  readonly coverage: PurchaseBranchConsolidationCoverage;
  readonly generatedAt: string;
}

/** Persistence boundary for a permission-checked multi-branch purchasing read. */
export interface PurchaseBranchConsolidationReader {
  /**
   * Reads confirmed purchases by accessible branch, retaining only functional VES totals.
   * @param query - Authenticated actor, company, period, and optional branch filter.
   * @returns Exact grouped totals and attribution coverage.
   * @throws {PurchaseBranchConsolidationFailure} When scope, authorization, or persistence fails.
   */
  read(query: PurchaseBranchConsolidationQuery): Promise<PurchaseBranchConsolidation>;
}

/** Stable expected failures for branch purchase consolidation. */
export type PurchaseBranchConsolidationFailureCode =
  | "PURCHASE_BRANCH_CONSOLIDATION_INVALID"
  | "PURCHASE_BRANCH_CONSOLIDATION_ACCESS_DENIED"
  | "PURCHASE_BRANCH_CONSOLIDATION_UNAVAILABLE";

/** Expected failure exposed by the branch consolidation use case and adapter. */
export class PurchaseBranchConsolidationFailure extends Error {
  /**
   * Creates a typed consolidation failure.
   * @param code - Stable failure code.
   * @param message - Safe explanation suitable for application handling.
   * @param options - Optional underlying cause for diagnostics.
   * @returns A typed error instance carrying the stable failure code.
   */
  constructor(readonly code: PurchaseBranchConsolidationFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PurchaseBranchConsolidationFailure";
  }
}

/** Executes a validated, authorized purchasing consolidation over accessible branches. */
export class GetPurchaseBranchConsolidation {
  /**
   * Creates the consolidation query service.
   * @param reader - Repository that enforces company and branch authorization.
   * @returns A configured consolidation query service.
   */
  constructor(private readonly reader: PurchaseBranchConsolidationReader) {}

  /**
   * Reads a maximum 366-day report period without inferring historical branch ownership.
   * @param query - Actor, company, date range, and optional branch UUIDs.
   * @returns An immutable consolidation snapshot.
   * @throws {PurchaseBranchConsolidationFailure} When the query or read is rejected.
   */
  async execute(query: PurchaseBranchConsolidationQuery): Promise<PurchaseBranchConsolidation> {
    const normalized = validatePurchaseBranchConsolidationQuery(query);
    try {
      return await this.reader.read(normalized);
    } catch (cause) {
      if (cause instanceof PurchaseBranchConsolidationFailure) throw cause;
      throw new PurchaseBranchConsolidationFailure("PURCHASE_BRANCH_CONSOLIDATION_UNAVAILABLE", "Branch purchase consolidation is unavailable.", { cause });
    }
  }
}

/**
 * Validates and freezes a branch-consolidation request before persistence.
 * @param query - Caller-supplied report identity, period, and optional branches.
 * @returns A normalized request with sorted unique branch UUIDs.
 * @throws {PurchaseBranchConsolidationFailure} When identity, dates, period, or branch IDs are invalid.
 */
export function validatePurchaseBranchConsolidationQuery(query: PurchaseBranchConsolidationQuery): PurchaseBranchConsolidationQuery {
  if (typeof query.actorUserId !== "string" || !query.actorUserId.trim()
    || typeof query.organizationId !== "string" || !query.organizationId.trim()
    || typeof query.companyId !== "string" || !query.companyId.trim()) throw invalid("Purchase consolidation scope is required.");
  const from = civilDate(query.from);
  const to = civilDate(query.to);
  if (from > to) throw invalid("Purchase consolidation start date must not follow its end date.");
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1 > 366) throw invalid("Purchase consolidation periods cannot exceed 366 days.");
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
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid("Purchase consolidation dates must use YYYY-MM-DD.");
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) throw invalid("Purchase consolidation date is not a valid civil date.");
  return value;
}

function invalid(message: string): PurchaseBranchConsolidationFailure {
  return new PurchaseBranchConsolidationFailure("PURCHASE_BRANCH_CONSOLIDATION_INVALID", message);
}
