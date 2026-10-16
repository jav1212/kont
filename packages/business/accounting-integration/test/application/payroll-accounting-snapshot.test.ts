import assert from "node:assert/strict";
import test from "node:test";
import { currency, moneyFromDecimal } from "@kontave/monetary/domain";
import {
  AccountingIntegrationFailure,
  ReadConfirmedPayrollAccountingSnapshot,
  planPayrollRunConfirmedIntegration,
  payrollAccountingSnapshotToConfirmedEvent,
  type ConfirmedPayrollAccountingSnapshot,
  type PayrollAccountingRuleSet,
} from "../../src";
import { SupabasePayrollAccountingSnapshotReader, type PayrollAccountingSupabaseSource } from "../../src/adapters/supabase";

const VES = currency("VES", 2);
const query = { actorId: "actor-1", tenantId: "tenant-1", organizationId: "organization-1", companyId: "company-1", payrollRunId: "run-1" };
const rulesWithoutContributions: PayrollAccountingRuleSet = {
  source: "payroll.run_confirmed",
  version: "1",
  rules: [
    { id: "gross", version: "1", amountField: "gross_earnings", debitAccountId: "expense:wages", creditAccountId: "liability:payroll" },
    { id: "deductions", version: "1", amountField: "employee_deductions", debitAccountId: "liability:payroll", creditAccountId: "liability:deductions" },
    { id: "net", version: "1", amountField: "net_pay", debitAccountId: "liability:payroll", creditAccountId: "liability:payable" },
  ],
};

function snapshot(overrides: Partial<ConfirmedPayrollAccountingSnapshot> = {}): ConfirmedPayrollAccountingSnapshot {
  return {
    tenantId: "tenant-1",
    organizationId: "organization-1",
    companyId: "company-1",
    runId: "run-1",
    sourceVersion: 1,
    effectiveDate: "2026-10-15",
    confirmedAt: "2026-10-15T18:00:00.000Z",
    receiptCount: 2,
    grossEarnings: moneyFromDecimal("100.00", VES),
    employeeDeductions: moneyFromDecimal("10.00", VES),
    netPay: moneyFromDecimal("90.00", VES),
    roundingDifference: moneyFromDecimal("0.00", VES),
    employerContributions: null,
    ...overrides,
  };
}

function nativeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenantId: "tenant-1",
    organizationId: "organization-1",
    companyId: "company-1",
    runId: "run-1",
    sourceVersion: 1,
    effectiveDate: "2026-10-15",
    confirmedAt: "2026-10-15T18:00:00.000Z",
    receiptCount: 2,
    grossEarnings: "100.00",
    employeeDeductions: "10.00",
    netPay: "90.00",
    roundingDifference: "0.00",
    employerContributions: null,
    ...overrides,
  };
}

function source(data: unknown, error: { message?: string; code?: string } | null = null): PayrollAccountingSupabaseSource {
  return { async rpc(name, values) {
    assert.equal(name, "get_native_payroll_accounting_snapshot");
    assert.deepEqual(values, { p_actor_id: "actor-1", p_organization_id: "organization-1", p_company_id: "company-1", p_run_id: "run-1" });
    return { data, error };
  } };
}

test("a balanced aggregate payroll snapshot becomes a balanced VES plan without exposing receipts", async () => {
  const reader = new SupabasePayrollAccountingSnapshotReader(source(nativeRow()));
  const result = await new ReadConfirmedPayrollAccountingSnapshot(reader).execute(query);
  const plan = planPayrollRunConfirmedIntegration(payrollAccountingSnapshotToConfirmedEvent(result), rulesWithoutContributions);
  assert.equal(result.receiptCount, 2);
  assert.equal(result.employerContributions, null);
  assert.equal(plan.lines.filter((line) => line.side === "debit").reduce((sum, line) => sum + line.amount.minorAmount, 0n), 20_000n);
  assert.equal(plan.lines.filter((line) => line.side === "credit").reduce((sum, line) => sum + line.amount.minorAmount, 0n), 20_000n);
});

test("a one-cent reconciliation difference stays visible and blocks accounting planning", async () => {
  const reader = { async readConfirmed() { return snapshot({ netPay: moneyFromDecimal("90.01", VES), roundingDifference: moneyFromDecimal("0.01", VES) }); } };
  const result = await new ReadConfirmedPayrollAccountingSnapshot(reader).execute(query);
  assert.equal(result.roundingDifference.minorAmount, 1n);
  assert.throws(
    () => payrollAccountingSnapshotToConfirmedEvent(result),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_AMOUNT_INVALID",
  );
});

test("unknown employer contributions are allowed only when no accounting mapping refers to them", () => {
  const event = payrollAccountingSnapshotToConfirmedEvent(snapshot());
  assert.doesNotThrow(() => planPayrollRunConfirmedIntegration(event, rulesWithoutContributions));
  assert.throws(
    () => planPayrollRunConfirmedIntegration(event, {
      ...rulesWithoutContributions,
      rules: [...rulesWithoutContributions.rules, { id: "employer", version: "1", amountField: "employer_contributions", debitAccountId: "expense:employer", creditAccountId: "liability:employer" }],
    }),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_RULE_INVALID",
  );
});

test("foreign and malformed RPC payloads are rejected before a planner can consume them", async () => {
  const foreignReader = new SupabasePayrollAccountingSnapshotReader(source(nativeRow({ companyId: "company-2" })));
  await assert.rejects(
    () => new ReadConfirmedPayrollAccountingSnapshot(foreignReader).execute(query),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_SOURCE_INVALID",
  );
  const malformedReader = new SupabasePayrollAccountingSnapshotReader(source(nativeRow({ grossEarnings: "100" })));
  await assert.rejects(
    () => new ReadConfirmedPayrollAccountingSnapshot(malformedReader).execute(query),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_SOURCE_INVALID",
  );
});

test("permission and transport failures retain their expected source boundary errors", async () => {
  const denied = new SupabasePayrollAccountingSnapshotReader(source(null, { message: "PAYROLL_ACCOUNTING_SNAPSHOT_ACCESS_DENIED" }));
  await assert.rejects(
    () => new ReadConfirmedPayrollAccountingSnapshot(denied).execute(query),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_ACCESS_DENIED",
  );
  const unavailable = new SupabasePayrollAccountingSnapshotReader({ async rpc() { throw new Error("network unavailable"); } });
  await assert.rejects(
    () => new ReadConfirmedPayrollAccountingSnapshot(unavailable).execute(query),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE",
  );
});
