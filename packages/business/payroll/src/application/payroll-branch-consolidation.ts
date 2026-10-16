import type { CompanyId } from "@kontave/companies/domain";
import type { ExactDecimal } from "@kontave/monetary/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";

/** One receipt-to-branch binding submitted for an immutable confirmed payroll run. */
export interface PayrollReceiptBranchAssignment {
  readonly receiptId: string;
  readonly branchId: string;
}

/** Authorized command that assigns every selected receipt in a payroll run to a branch. */
export interface AssignPayrollRunReceiptBranchesCommand {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly runId: string;
  readonly assignments: readonly PayrollReceiptBranchAssignment[];
}

/** Durable outcome of the atomic receipt branch-attribution operation. */
export interface PayrollRunReceiptBranchAssignmentResult {
  readonly runId: string;
  readonly assignedReceiptCount: number;
  readonly assignedAt: string;
}

/** Atomic, authorization-aware persistence boundary for payroll receipt attribution. */
export interface PayrollRunReceiptBranchAssignmentPort {
  /**
   * Persists a complete, immutable receipt-to-branch assignment set for one run.
   * @param command - Validated actor scope, run identity, and receipt assignments.
   * @returns The authoritative assignment result.
   * @throws {PayrollBranchAssignmentFailure} When authorization, run state, or persistence rejects the command.
   */
  assign(command: AssignPayrollRunReceiptBranchesCommand): Promise<PayrollRunReceiptBranchAssignmentResult>;
}

/** Stable expected failures for protected payroll receipt branch attribution. */
export type PayrollBranchAssignmentFailureCode =
  | "PAYROLL_BRANCH_ASSIGNMENT_INVALID"
  | "PAYROLL_BRANCH_ASSIGNMENT_ACCESS_DENIED"
  | "PAYROLL_BRANCH_ASSIGNMENT_CONFLICT"
  | "PAYROLL_BRANCH_ASSIGNMENT_UNAVAILABLE";

/** Expected failure exposed by payroll receipt branch attribution. */
export class PayrollBranchAssignmentFailure extends Error {
  /**
   * Creates a stable, safe payroll branch attribution error.
   * @param code - Machine-readable failure category.
   * @param message - Safe explanation for the caller.
   * @param options - Optional causal diagnostic.
   * @returns A typed payroll branch attribution error.
   */
  constructor(readonly code: PayrollBranchAssignmentFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PayrollBranchAssignmentFailure";
  }
}

/** Assigns branches to receipts through the protected, atomic persistence boundary. */
export class AssignPayrollRunReceiptBranches {
  /**
   * Creates the payroll receipt attribution command.
   * @param port - Boundary that authorizes and atomically persists the assignment.
   * @returns A configured receipt attribution use case.
   */
  constructor(private readonly port: PayrollRunReceiptBranchAssignmentPort) {}

  /**
   * Validates and persists immutable branch attribution for one payroll run.
   * @param command - Actor scope, run identity, and selected receipt assignments.
   * @returns The immutable durable assignment result.
   * @throws {PayrollBranchAssignmentFailure} When the command, authorization, state, or persistence fails.
   */
  async execute(command: AssignPayrollRunReceiptBranchesCommand): Promise<PayrollRunReceiptBranchAssignmentResult> {
    const normalized = validateAssignPayrollRunReceiptBranchesCommand(command);
    try {
      return await this.port.assign(normalized);
    } catch (cause: unknown) {
      if (cause instanceof PayrollBranchAssignmentFailure) throw cause;
      throw new PayrollBranchAssignmentFailure("PAYROLL_BRANCH_ASSIGNMENT_UNAVAILABLE", "Payroll receipt branch assignment is unavailable.", { cause });
    }
  }
}

/**
 * Validates and freezes a payroll receipt branch-attribution command.
 * @param command - Untrusted actor scope, payroll run, and receipt assignments.
 * @returns A normalized immutable command with canonical branch UUIDs.
 * @throws {PayrollBranchAssignmentFailure} When scope, run, receipt, or branch identities are invalid.
 */
export function validateAssignPayrollRunReceiptBranchesCommand(
  command: AssignPayrollRunReceiptBranchesCommand,
): AssignPayrollRunReceiptBranchesCommand {
  if (!command || typeof command !== "object") throw assignmentInvalid("Payroll receipt branch assignment is required.");
  requireIdentifier(command.actorUserId, "Actor user ID");
  requireIdentifier(command.organizationId, "Organization ID");
  requireIdentifier(command.companyId, "Company ID");
  const runId = identifier(command.runId, "Payroll run ID");
  if (!Array.isArray(command.assignments) || command.assignments.length === 0 || command.assignments.length > 500) {
    throw assignmentInvalid("Between one and 500 receipt assignments are required.");
  }
  const receiptIds = new Set<string>();
  const assignments = command.assignments.map((assignment) => {
    if (!assignment || typeof assignment !== "object") throw assignmentInvalid("Each receipt assignment is required.");
    const receiptId = identifier(assignment.receiptId, "Payroll receipt ID");
    if (receiptIds.has(receiptId)) throw assignmentInvalid("Payroll receipt assignments must be unique.");
    receiptIds.add(receiptId);
    if (typeof assignment.branchId !== "string" || !uuid.test(assignment.branchId.trim())) {
      throw assignmentInvalid("Each company branch ID must be a UUID.");
    }
    return Object.freeze({ receiptId, branchId: assignment.branchId.trim().toLowerCase() });
  });
  return Object.freeze({ ...command, runId, assignments: Object.freeze(assignments) });
}

/** Authorized period query for confirmed payroll receipts grouped by branch. */
export interface PayrollBranchConsolidationQuery {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly from: string;
  readonly to: string;
  /** Omit to include every branch the actor is permitted to read. */
  readonly branchIds?: readonly string[];
}

/** Exact functional VES totals for one accessible company branch. */
export interface PayrollBranchConsolidationRow {
  readonly branchId: string;
  readonly branchCode: string;
  readonly branchName: string;
  readonly receiptCount: number;
  readonly totalEarnings: ExactDecimal;
  readonly totalDeductions: ExactDecimal;
  readonly totalBonuses: ExactDecimal;
  readonly netPay: ExactDecimal;
  readonly functionalCurrency: "VES";
}

/** Coverage makes confirmed receipts lacking branch attribution visible without exposing PII. */
export interface PayrollBranchConsolidationCoverage {
  readonly attributedConfirmedReceiptCount: number;
  /** `null` when the actor cannot inspect company-wide unattributed receipt history. */
  readonly unattributedConfirmedReceiptCount: number | null;
  readonly includesUnattributed: boolean;
}

/** Immutable branch payroll aggregation and attribution-coverage metadata. */
export interface PayrollBranchConsolidation {
  readonly period: { readonly from: string; readonly to: string };
  readonly rows: readonly PayrollBranchConsolidationRow[];
  readonly coverage: PayrollBranchConsolidationCoverage;
  readonly generatedAt: string;
}

/** Query port for a permission-checked, PII-free payroll branch consolidation. */
export interface PayrollBranchConsolidationReader {
  /**
   * Reads functional payroll totals by accessible branch for an inclusive civil period.
   * @param query - Validated actor scope, date range, and optional branch filter.
   * @returns Exact VES totals and explicit attribution coverage.
   * @throws {PayrollBranchConsolidationFailure} When scope, authorization, or persistence fails.
   */
  read(query: PayrollBranchConsolidationQuery): Promise<PayrollBranchConsolidation>;
}

/** Stable expected failures for payroll branch consolidation. */
export type PayrollBranchConsolidationFailureCode =
  | "PAYROLL_BRANCH_CONSOLIDATION_INVALID"
  | "PAYROLL_BRANCH_CONSOLIDATION_ACCESS_DENIED"
  | "PAYROLL_BRANCH_CONSOLIDATION_UNAVAILABLE";

/** Expected failure exposed by the payroll branch consolidation use case and adapter. */
export class PayrollBranchConsolidationFailure extends Error {
  /**
   * Creates a typed payroll branch consolidation error.
   * @param code - Machine-readable failure category.
   * @param message - Safe explanation for the caller.
   * @param options - Optional causal diagnostic.
   * @returns A typed payroll branch consolidation error.
   */
  constructor(readonly code: PayrollBranchConsolidationFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PayrollBranchConsolidationFailure";
  }
}

/** Executes a validated, authorized payroll consolidation over accessible branches. */
export class GetPayrollBranchConsolidation {
  /**
   * Creates the payroll branch consolidation query service.
   * @param reader - Repository that authorizes the company and branch scope.
   * @returns A configured payroll consolidation query service.
   */
  constructor(private readonly reader: PayrollBranchConsolidationReader) {}

  /**
   * Reads at most 366 inclusive civil days without inferring historic branch ownership.
   * @param query - Actor scope, period, and optional branch filter.
   * @returns An immutable PII-free payroll consolidation snapshot.
   * @throws {PayrollBranchConsolidationFailure} When validation or the read fails.
   */
  async execute(query: PayrollBranchConsolidationQuery): Promise<PayrollBranchConsolidation> {
    const normalized = validatePayrollBranchConsolidationQuery(query);
    try {
      return await this.reader.read(normalized);
    } catch (cause: unknown) {
      if (cause instanceof PayrollBranchConsolidationFailure) throw cause;
      throw new PayrollBranchConsolidationFailure("PAYROLL_BRANCH_CONSOLIDATION_UNAVAILABLE", "Payroll branch consolidation is unavailable.", { cause });
    }
  }
}

/**
 * Validates and freezes a branch payroll consolidation query.
 * @param query - Untrusted actor scope, inclusive dates, and optional branch filter.
 * @returns A normalized immutable query with canonical sorted branch UUIDs.
 * @throws {PayrollBranchConsolidationFailure} When scope, dates, period, or branch IDs are invalid.
 */
export function validatePayrollBranchConsolidationQuery(query: PayrollBranchConsolidationQuery): PayrollBranchConsolidationQuery {
  if (!query || typeof query !== "object") throw consolidationInvalid("Payroll consolidation query is required.");
  requireConsolidationIdentifier(query.actorUserId, "Actor user ID");
  requireConsolidationIdentifier(query.organizationId, "Organization ID");
  requireConsolidationIdentifier(query.companyId, "Company ID");
  const from = civilDate(query.from);
  const to = civilDate(query.to);
  if (from > to) throw consolidationInvalid("Payroll consolidation start date must not follow its end date.");
  const days = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > 366) throw consolidationInvalid("Payroll consolidation periods cannot exceed 366 days.");
  if (query.branchIds !== undefined && !Array.isArray(query.branchIds)) throw consolidationInvalid("Branch filters must be an array of UUIDs.");
  const branchIds = query.branchIds === undefined ? undefined : normalizeBranchIds(query.branchIds);
  return Object.freeze({ ...query, from, to, ...(branchIds === undefined ? {} : { branchIds }) });
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireIdentifier(value: unknown, label: string): void {
  identifier(value, label);
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 128) {
    throw assignmentInvalid(`${label} is invalid.`);
  }
  return value.trim();
}

function requireConsolidationIdentifier(value: unknown, label: string): void {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 128) {
    throw consolidationInvalid(`${label} is invalid.`);
  }
}

function normalizeBranchIds(value: readonly string[]): readonly string[] {
  if (value.length > 100) throw consolidationInvalid("At most 100 branches can be requested at once.");
  const normalized = value.map((branchId) => {
    if (typeof branchId !== "string" || !uuid.test(branchId.trim())) throw consolidationInvalid("Every branch identifier must be a UUID.");
    return branchId.trim().toLowerCase();
  });
  if (new Set(normalized).size !== normalized.length) throw consolidationInvalid("Branch identifiers must be unique.");
  return Object.freeze([...normalized].sort());
}

function civilDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw consolidationInvalid("Payroll consolidation dates must use YYYY-MM-DD.");
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
    throw consolidationInvalid("Payroll consolidation date is invalid.");
  }
  return value;
}

function assignmentInvalid(message: string): PayrollBranchAssignmentFailure {
  return new PayrollBranchAssignmentFailure("PAYROLL_BRANCH_ASSIGNMENT_INVALID", message);
}

function consolidationInvalid(message: string): PayrollBranchConsolidationFailure {
  return new PayrollBranchConsolidationFailure("PAYROLL_BRANCH_CONSOLIDATION_INVALID", message);
}
