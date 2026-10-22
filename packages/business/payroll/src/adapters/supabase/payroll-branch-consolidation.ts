import { exactDecimal } from "@kontave/monetary/domain";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  PayrollBranchAssignmentFailure,
  PayrollBranchConsolidationFailure,
  type AssignPayrollRunReceiptBranchesCommand,
  type PayrollBranchConsolidation,
  type PayrollBranchConsolidationQuery,
  type PayrollBranchConsolidationReader,
  type PayrollRunReceiptBranchAssignmentPort,
  type PayrollRunReceiptBranchAssignmentResult,
} from "../../application";

const decimal = z.string().refine((value) => {
  try { exactDecimal(value); return true; } catch { return false; }
}, { message: "Invalid exact decimal." });
const assignmentResponse = z.object({
  runId: z.string().trim().min(1).max(128),
  assignedReceiptCount: z.number().int().positive().max(500),
  assignedAt: z.string().datetime({ offset: true }),
});
const consolidationResponse = z.object({
  period: z.object({ from: z.string().date(), to: z.string().date() }),
  rows: z.array(z.object({
    branchId: z.string().uuid(), branchCode: z.string().trim().min(1), branchName: z.string().trim().min(1),
    receiptCount: z.number().int().positive(), totalEarnings: decimal, totalDeductions: decimal,
    totalBonuses: decimal, netPay: decimal, functionalCurrency: z.literal("VES"),
  })),
  coverage: z.object({
    attributedConfirmedReceiptCount: z.number().int().nonnegative(),
    unattributedConfirmedReceiptCount: z.number().int().nonnegative().nullable(),
    includesUnattributed: z.boolean(),
  }),
  generatedAt: z.string().datetime({ offset: true }),
});

/** Service credentials required for protected payroll branch RPCs. */
export interface SupabasePayrollBranchConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/** Server-only adapter that atomically persists payroll receipt branch attribution. */
export class SupabasePayrollRunReceiptBranchAssignmentPort implements PayrollRunReceiptBranchAssignmentPort {
  /**
   * Creates a port bound to a trusted Supabase service client.
   * @param client - Server-side client permitted to call the protected assignment RPC.
   * @returns A protected payroll receipt assignment port.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc PayrollRunReceiptBranchAssignmentPort.assign} */
  async assign(command: AssignPayrollRunReceiptBranchesCommand): Promise<PayrollRunReceiptBranchAssignmentResult> {
    try {
      const { data, error } = await this.client.rpc("assign_native_payroll_run_receipt_branches", {
        p_actor_user_id: command.actorUserId,
        p_organization_id: command.organizationId,
        p_company_id: command.companyId,
        p_run_id: command.runId,
        p_assignments: command.assignments,
      });
      if (error) throw assignmentFailure(error.message, error);
      const parsed = assignmentResponse.safeParse(data);
      if (!parsed.success) throw assignmentUnavailable("Payroll receipt branch assignment returned malformed data.", parsed.error);
      if (parsed.data.runId !== command.runId || parsed.data.assignedReceiptCount !== command.assignments.length) {
        throw assignmentUnavailable("Payroll receipt branch assignment response does not match the requested run.", parsed.data);
      }
      return Object.freeze({ ...parsed.data });
    } catch (cause: unknown) {
      if (cause instanceof PayrollBranchAssignmentFailure) throw cause;
      throw assignmentUnavailable("Payroll receipt branch assignment is unavailable.", cause);
    }
  }
}

/** Server-only adapter that reads PII-free payroll branch consolidation. */
export class SupabasePayrollBranchConsolidationReader implements PayrollBranchConsolidationReader {
  /**
   * Creates a reader bound to a trusted Supabase service client.
   * @param client - Server-side client permitted to call the protected consolidation RPC.
   * @returns A protected payroll branch consolidation reader.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc PayrollBranchConsolidationReader.read} */
  async read(query: PayrollBranchConsolidationQuery): Promise<PayrollBranchConsolidation> {
    try {
      const { data, error } = await this.client.rpc("get_native_payroll_branch_consolidation", {
        p_actor_user_id: query.actorUserId,
        p_organization_id: query.organizationId,
        p_company_id: query.companyId,
        p_from: query.from,
        p_to: query.to,
        p_branch_ids: query.branchIds ?? null,
      });
      if (error) throw consolidationFailure(error.message, error);
      const parsed = consolidationResponse.safeParse(data);
      if (!parsed.success) throw consolidationUnavailable("Payroll branch consolidation returned malformed data.", parsed.error);
      if (parsed.data.period.from !== query.from || parsed.data.period.to !== query.to) {
        throw consolidationUnavailable("Payroll branch consolidation returned a different period.", parsed.data.period);
      }
      if (parsed.data.coverage.includesUnattributed !== (parsed.data.coverage.unattributedConfirmedReceiptCount !== null)) {
        throw consolidationUnavailable("Payroll branch consolidation returned inconsistent coverage.", parsed.data.coverage);
      }
      return Object.freeze({
        period: Object.freeze({ ...parsed.data.period }),
        rows: Object.freeze(parsed.data.rows.map((row) => Object.freeze({
          ...row,
          branchId: row.branchId.toLowerCase(),
          totalEarnings: exactDecimal(row.totalEarnings), totalDeductions: exactDecimal(row.totalDeductions),
          totalBonuses: exactDecimal(row.totalBonuses), netPay: exactDecimal(row.netPay),
        }))),
        coverage: Object.freeze({ ...parsed.data.coverage }),
        generatedAt: parsed.data.generatedAt,
      });
    } catch (cause: unknown) {
      if (cause instanceof PayrollBranchConsolidationFailure) throw cause;
      throw consolidationUnavailable("Payroll branch consolidation is unavailable.", cause);
    }
  }
}

/**
 * Creates the server-only protected payroll receipt branch assignment port.
 * @param configuration - Supabase URL and service-role key retained in trusted composition.
 * @returns A port that validates every assignment response.
 * @throws {PayrollBranchAssignmentFailure} When remote assignment cannot be configured.
 */
export function createSupabasePayrollRunReceiptBranchAssignmentPort(
  configuration: SupabasePayrollBranchConfiguration,
): PayrollRunReceiptBranchAssignmentPort {
  return new SupabasePayrollRunReceiptBranchAssignmentPort(client(configuration));
}

/**
 * Creates the server-only protected payroll branch consolidation reader.
 * @param configuration - Supabase URL and service-role key retained in trusted composition.
 * @returns A reader that validates every PII-free consolidation response.
 * @throws {PayrollBranchConsolidationFailure} When remote reporting cannot be configured.
 */
export function createSupabasePayrollBranchConsolidationReader(
  configuration: SupabasePayrollBranchConfiguration,
): PayrollBranchConsolidationReader {
  return new SupabasePayrollBranchConsolidationReader(client(configuration));
}

function client(configuration: SupabasePayrollBranchConfiguration): SupabaseClient {
  return createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function assignmentFailure(message: string, cause: unknown): PayrollBranchAssignmentFailure {
  if (message.includes("PAYROLL_BRANCH_ASSIGNMENT_ACCESS_DENIED")) return new PayrollBranchAssignmentFailure("PAYROLL_BRANCH_ASSIGNMENT_ACCESS_DENIED", "Payroll receipt branch assignment access was denied.", { cause });
  if (message.includes("PAYROLL_BRANCH_ASSIGNMENT_INVALID")) return new PayrollBranchAssignmentFailure("PAYROLL_BRANCH_ASSIGNMENT_INVALID", "Payroll receipt branch assignment is invalid.", { cause });
  if (message.includes("PAYROLL_BRANCH_ASSIGNMENT_CONFLICT")) return new PayrollBranchAssignmentFailure("PAYROLL_BRANCH_ASSIGNMENT_CONFLICT", "Payroll receipt branch assignment conflicts with the confirmed run.", { cause });
  return assignmentUnavailable("Payroll receipt branch assignment is unavailable.", cause);
}

function consolidationFailure(message: string, cause: unknown): PayrollBranchConsolidationFailure {
  if (message.includes("PAYROLL_BRANCH_CONSOLIDATION_ACCESS_DENIED")) return new PayrollBranchConsolidationFailure("PAYROLL_BRANCH_CONSOLIDATION_ACCESS_DENIED", "Payroll branch consolidation access was denied.", { cause });
  if (message.includes("PAYROLL_BRANCH_CONSOLIDATION_INVALID")) return new PayrollBranchConsolidationFailure("PAYROLL_BRANCH_CONSOLIDATION_INVALID", "Payroll branch consolidation query is invalid.", { cause });
  return consolidationUnavailable("Payroll branch consolidation is unavailable.", cause);
}

function assignmentUnavailable(message: string, cause: unknown): PayrollBranchAssignmentFailure {
  return new PayrollBranchAssignmentFailure("PAYROLL_BRANCH_ASSIGNMENT_UNAVAILABLE", message, { cause });
}

function consolidationUnavailable(message: string, cause: unknown): PayrollBranchConsolidationFailure {
  return new PayrollBranchConsolidationFailure("PAYROLL_BRANCH_CONSOLIDATION_UNAVAILABLE", message, { cause });
}
