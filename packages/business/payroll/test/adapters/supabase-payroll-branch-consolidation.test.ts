import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PayrollBranchAssignmentFailure,
  PayrollBranchConsolidationFailure,
  type AssignPayrollRunReceiptBranchesCommand,
  type PayrollBranchConsolidationQuery,
} from "../../src/application";
import {
  SupabasePayrollBranchConsolidationReader,
  SupabasePayrollRunReceiptBranchAssignmentPort,
} from "../../src/adapters/supabase";

const branch = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const assignment = {
  actorUserId: "actor", organizationId: "organization", companyId: "company", runId: "run-1",
  assignments: [{ receiptId: "receipt-1", branchId: branch }],
} as never as AssignPayrollRunReceiptBranchesCommand;
const query = {
  actorUserId: "actor", organizationId: "organization", companyId: "company", from: "2026-01-01", to: "2026-01-31", branchIds: [branch],
} as never as PayrollBranchConsolidationQuery;
const consolidation = {
  period: { from: query.from, to: query.to },
  rows: [{ branchId: branch, branchCode: "HQ", branchName: "Headquarters", receiptCount: 2, totalEarnings: "100.00", totalDeductions: "15.50", totalBonuses: "5.00", netPay: "89.50", functionalCurrency: "VES" }],
  coverage: { attributedConfirmedReceiptCount: 2, unattributedConfirmedReceiptCount: null, includesUnattributed: false },
  generatedAt: "2026-10-02T12:00:00.000Z",
};

function fakeClient(reply: { readonly data: unknown; readonly error: { readonly message: string } | null }, calls: unknown[]): SupabaseClient {
  return { async rpc(name: string, parameters: unknown) { calls.push({ name, parameters }); return reply; } } as unknown as SupabaseClient;
}

test("payroll branch assignment adapter calls the protected scoped RPC and validates its immutable result", async () => {
  const calls: unknown[] = [];
  const port = new SupabasePayrollRunReceiptBranchAssignmentPort(fakeClient({
    data: { runId: assignment.runId, assignedReceiptCount: 1, assignedAt: "2026-10-02T12:00:00.000Z" }, error: null,
  }, calls));
  const result = await port.assign(assignment);

  assert.deepEqual(calls, [{ name: "assign_native_payroll_run_receipt_branches", parameters: {
    p_actor_user_id: assignment.actorUserId, p_organization_id: assignment.organizationId, p_company_id: assignment.companyId,
    p_run_id: assignment.runId, p_assignments: assignment.assignments,
  } }]);
  assert.equal(Object.isFrozen(result), true);
});

test("payroll branch assignment adapter maps access, conflict, and malformed RPC output", async () => {
  for (const [message, code] of [["PAYROLL_BRANCH_ASSIGNMENT_ACCESS_DENIED", "PAYROLL_BRANCH_ASSIGNMENT_ACCESS_DENIED"], ["PAYROLL_BRANCH_ASSIGNMENT_CONFLICT", "PAYROLL_BRANCH_ASSIGNMENT_CONFLICT"]] as const) {
    await assert.rejects(new SupabasePayrollRunReceiptBranchAssignmentPort(fakeClient({ data: null, error: { message } }, [])).assign(assignment), (error: unknown) =>
      error instanceof PayrollBranchAssignmentFailure && error.code === code);
  }
  await assert.rejects(new SupabasePayrollRunReceiptBranchAssignmentPort(fakeClient({ data: { runId: "other", assignedReceiptCount: 1, assignedAt: "2026-10-02T12:00:00.000Z" }, error: null }, [])).assign(assignment), (error: unknown) =>
    error instanceof PayrollBranchAssignmentFailure && error.code === "PAYROLL_BRANCH_ASSIGNMENT_UNAVAILABLE");
});

test("payroll branch consolidation adapter calls the scoped RPC and decodes exact decimal VES totals", async () => {
  const calls: unknown[] = [];
  const reader = new SupabasePayrollBranchConsolidationReader(fakeClient({ data: consolidation, error: null }, calls));
  const result = await reader.read(query);

  assert.deepEqual(calls, [{ name: "get_native_payroll_branch_consolidation", parameters: {
    p_actor_user_id: query.actorUserId, p_organization_id: query.organizationId, p_company_id: query.companyId,
    p_from: query.from, p_to: query.to, p_branch_ids: query.branchIds,
  } }]);
  assert.equal(result.rows[0]?.totalEarnings, "100");
  assert.equal(result.rows[0]?.netPay, "89.5");
  assert.equal(Object.isFrozen(result.rows), true);
});

test("payroll branch consolidation adapter maps authorization and rejects malformed or inconsistent output", async () => {
  await assert.rejects(new SupabasePayrollBranchConsolidationReader(fakeClient({ data: null, error: { message: "PAYROLL_BRANCH_CONSOLIDATION_ACCESS_DENIED" } }, [])).read(query), (error: unknown) =>
    error instanceof PayrollBranchConsolidationFailure && error.code === "PAYROLL_BRANCH_CONSOLIDATION_ACCESS_DENIED");
  await assert.rejects(new SupabasePayrollBranchConsolidationReader(fakeClient({ data: { ...consolidation, rows: [{ ...consolidation.rows[0], netPay: "NaN" }] }, error: null }, [])).read(query), (error: unknown) =>
    error instanceof PayrollBranchConsolidationFailure && error.code === "PAYROLL_BRANCH_CONSOLIDATION_UNAVAILABLE");
  await assert.rejects(new SupabasePayrollBranchConsolidationReader(fakeClient({ data: { ...consolidation, coverage: { ...consolidation.coverage, includesUnattributed: true } }, error: null }, [])).read(query), (error: unknown) =>
    error instanceof PayrollBranchConsolidationFailure && error.code === "PAYROLL_BRANCH_CONSOLIDATION_UNAVAILABLE");
});
