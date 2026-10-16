import assert from "node:assert/strict";
import test from "node:test";
import {
  AssignPayrollRunReceiptBranches,
  GetPayrollBranchConsolidation,
  PayrollBranchAssignmentFailure,
  PayrollBranchConsolidationFailure,
  validateAssignPayrollRunReceiptBranchesCommand,
  validatePayrollBranchConsolidationQuery,
  type AssignPayrollRunReceiptBranchesCommand,
  type PayrollBranchConsolidationQuery,
  type PayrollRunReceiptBranchAssignmentPort,
} from "../../src/application";

const branchA = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const branchB = "7be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const assignment = {
  actorUserId: "actor", organizationId: "organization", companyId: "company", runId: "run-1",
  assignments: [{ receiptId: "receipt-1", branchId: branchA }, { receiptId: "receipt-2", branchId: branchB }],
} as never as AssignPayrollRunReceiptBranchesCommand;
const query = {
  actorUserId: "actor", organizationId: "organization", companyId: "company",
  from: "2026-01-01", to: "2026-01-31", branchIds: [branchB, branchA],
} as never as PayrollBranchConsolidationQuery;

test("payroll receipt branch assignment validates, canonicalizes, and freezes an immutable command", () => {
  const valid = validateAssignPayrollRunReceiptBranchesCommand({
    ...assignment,
    runId: " run-1 ",
    assignments: [{ receiptId: " receipt-1 ", branchId: branchA.toUpperCase() }],
  });

  assert.equal(valid.runId, "run-1");
  assert.equal(valid.assignments[0]?.branchId, branchA);
  assert.equal(Object.isFrozen(valid), true);
  assert.equal(Object.isFrozen(valid.assignments), true);
  assert.equal(Object.isFrozen(valid.assignments[0]), true);
});

test("payroll receipt branch assignment rejects empty, excessive, duplicate, and invalid branch receipt input", () => {
  assert.throws(() => validateAssignPayrollRunReceiptBranchesCommand({ ...assignment, assignments: [] }), assignmentInvalid);
  assert.throws(() => validateAssignPayrollRunReceiptBranchesCommand({ ...assignment, assignments: [{ receiptId: "receipt-1", branchId: "HQ" }] }), assignmentInvalid);
  assert.throws(() => validateAssignPayrollRunReceiptBranchesCommand({
    ...assignment,
    assignments: [{ receiptId: "receipt-1", branchId: branchA }, { receiptId: "receipt-1", branchId: branchB }],
  }), assignmentInvalid);
  assert.throws(() => validateAssignPayrollRunReceiptBranchesCommand({
    ...assignment,
    assignments: Array.from({ length: 501 }, (_, index) => ({ receiptId: `receipt-${index}`, branchId: branchA })),
  }), assignmentInvalid);
});

test("payroll receipt branch assignment preserves conflict failures and wraps unexpected failures", async () => {
  const conflict: PayrollRunReceiptBranchAssignmentPort = {
    async assign() { throw new PayrollBranchAssignmentFailure("PAYROLL_BRANCH_ASSIGNMENT_CONFLICT", "immutable"); },
  };
  await assert.rejects(new AssignPayrollRunReceiptBranches(conflict).execute(assignment), (error: unknown) =>
    error instanceof PayrollBranchAssignmentFailure && error.code === "PAYROLL_BRANCH_ASSIGNMENT_CONFLICT");
  const unavailable: PayrollRunReceiptBranchAssignmentPort = { async assign() { throw new Error("network"); } };
  await assert.rejects(new AssignPayrollRunReceiptBranches(unavailable).execute(assignment), (error: unknown) =>
    error instanceof PayrollBranchAssignmentFailure && error.code === "PAYROLL_BRANCH_ASSIGNMENT_UNAVAILABLE");
});

test("payroll branch consolidation requires a valid maximum 366-day date range and unique UUID filters", () => {
  const valid = validatePayrollBranchConsolidationQuery({ ...query, branchIds: [branchB.toUpperCase(), branchA] });
  assert.deepEqual(valid.branchIds, [branchA, branchB]);
  assert.equal(Object.isFrozen(valid.branchIds), true);
  for (const invalid of [
    { ...query, from: "2026-02-30" },
    { ...query, to: "2027-01-02" },
    { ...query, branchIds: [branchA, branchA] },
    { ...query, branchIds: ["HQ"] },
    { ...query, branchIds: Array.from({ length: 101 }, (_, index) => `6be10ba0-d5d3-4a61-a34f-${String(index).padStart(12, "0")}`) },
  ]) assert.throws(() => validatePayrollBranchConsolidationQuery(invalid as never), consolidationInvalid);
});

test("payroll branch consolidation preserves authorization errors and wraps unavailable readers", async () => {
  const denied = { async read() { throw new PayrollBranchConsolidationFailure("PAYROLL_BRANCH_CONSOLIDATION_ACCESS_DENIED", "denied"); } };
  await assert.rejects(new GetPayrollBranchConsolidation(denied).execute(query), (error: unknown) =>
    error instanceof PayrollBranchConsolidationFailure && error.code === "PAYROLL_BRANCH_CONSOLIDATION_ACCESS_DENIED");
  const broken = { async read() { throw new Error("network"); } };
  await assert.rejects(new GetPayrollBranchConsolidation(broken).execute(query), (error: unknown) =>
    error instanceof PayrollBranchConsolidationFailure && error.code === "PAYROLL_BRANCH_CONSOLIDATION_UNAVAILABLE");
});

function assignmentInvalid(error: unknown): boolean {
  return error instanceof PayrollBranchAssignmentFailure && error.code === "PAYROLL_BRANCH_ASSIGNMENT_INVALID";
}

function consolidationInvalid(error: unknown): boolean {
  return error instanceof PayrollBranchConsolidationFailure && error.code === "PAYROLL_BRANCH_CONSOLIDATION_INVALID";
}
