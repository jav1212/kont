import assert from "node:assert/strict";
import test from "node:test";
import { currency, moneyFromDecimal } from "@kontave/monetary/domain";
import {
  AccountingIntegrationFailure,
  PostAccountingIntegration,
  ReverseAccountingIntegration,
  ReadActivePayrollAccountingRuleSet,
  planAccountingIntegrationReversal,
  planPayrollRunConfirmedIntegration,
} from "../../src";
import {
  SupabasePayrollAccountingPoster,
  SupabasePayrollAccountingRuleSetReader,
  type PayrollAccountingPostingSupabaseSource,
  type PayrollAccountingRuleSetSupabaseSource,
} from "../../src/adapters/supabase";

const VES = currency("VES", 2);
const VES_FOUR_DECIMALS = currency("VES", 4);
const context = { actorId: "actor-1", tenantId: "tenant-1", organizationId: "organization-1", companyId: "company-1" };

function plan() {
  return planPayrollRunConfirmedIntegration(
    {
      source: "payroll.run_confirmed",
      tenantId: "tenant-1",
      organizationId: "organization-1",
      companyId: "company-1",
      payrollRunId: "run-1",
      payrollRunVersion: 1,
      effectiveDate: "2026-10-15",
      occurredAt: "2026-10-15T18:00:00.000Z",
      grossEarnings: moneyFromDecimal("100.00", VES),
      employeeDeductions: moneyFromDecimal("10.00", VES),
      employerContributions: null,
      netPay: moneyFromDecimal("90.00", VES),
    },
    {
      source: "payroll.run_confirmed",
      version: "rules-v1",
      rules: [
        { id: "gross", version: "1", amountField: "gross_earnings", debitAccountId: "expense:wages", creditAccountId: "liability:payroll" },
        { id: "deductions", version: "1", amountField: "employee_deductions", debitAccountId: "liability:payroll", creditAccountId: "liability:deductions" },
        { id: "net", version: "1", amountField: "net_pay", debitAccountId: "liability:payroll", creditAccountId: "liability:payable" },
      ],
    },
  );
}

function reversal() {
  return planAccountingIntegrationReversal(plan(), {
    effectiveDate: "2026-10-16",
    occurredAt: "2026-10-16T18:00:00.000Z",
    reason: "Payroll correction",
  });
}

test("the rule adapter sends only authorized scope and returns a typed active payroll mapping", async () => {
  const source: PayrollAccountingRuleSetSupabaseSource = {
    async rpc(name, values) {
      assert.equal(name, "get_native_payroll_accounting_rule_set");
      assert.deepEqual(values, { p_actor_id: "actor-1", p_organization_id: "organization-1", p_company_id: "company-1" });
      return {
        data: {
          source: "payroll.run_confirmed",
          version: "rules-v1",
          rules: [{ id: "gross", version: "1", amountField: "gross_earnings", debitAccountId: "expense:wages", creditAccountId: "liability:payroll" }],
        },
        error: null,
      };
    },
  };
  const result = await new ReadActivePayrollAccountingRuleSet(new SupabasePayrollAccountingRuleSetReader(source)).execute(context);
  assert.deepEqual(result, {
    source: "payroll.run_confirmed",
    version: "rules-v1",
    rules: [{ id: "gross", version: "1", amountField: "gross_earnings", debitAccountId: "expense:wages", creditAccountId: "liability:payroll" }],
  });
  assert.equal(Object.isFrozen(result), true);
});

test("the rule adapter maps missing active rules and malformed mappings to expected failures", async () => {
  const missing: PayrollAccountingRuleSetSupabaseSource = { async rpc() { return { data: null, error: { message: "NO_ACTIVE_RULES" } }; } };
  await assert.rejects(
    () => new ReadActivePayrollAccountingRuleSet(new SupabasePayrollAccountingRuleSetReader(missing)).execute(context),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_RULESET_INVALID",
  );
  const malformed: PayrollAccountingRuleSetSupabaseSource = { async rpc() { return { data: { source: "payroll.run_confirmed", version: "1", rules: [{ id: "x" }] }, error: null }; } };
  await assert.rejects(
    () => new ReadActivePayrollAccountingRuleSet(new SupabasePayrollAccountingRuleSetReader(malformed)).execute(context),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_RULE_INVALID",
  );
});

test("the posting adapter preserves exact VES strings and passes an identical replay receipt", async () => {
  const input = plan();
  const source: PayrollAccountingPostingSupabaseSource = {
    async rpc(name, values) {
      assert.equal(name, "post_native_payroll_accounting_integration");
      assert.equal(values.p_actor_id, "actor-1");
      assert.equal(values.p_organization_id, "organization-1");
      assert.equal(values.p_company_id, "company-1");
      const payload = values.p_plan as { lines: Array<{ amount: string }>; operationKey: string };
      assert.equal(payload.operationKey, input.operationKey);
      assert.deepEqual(payload.lines.map((line) => line.amount), ["100.00", "100.00", "10.00", "10.00", "90.00", "90.00"]);
      return { data: { operationKey: input.operationKey, journalEntryId: "journal-1", replayed: true }, error: null };
    },
  };
  const receipt = await new PostAccountingIntegration(new SupabasePayrollAccountingPoster(source)).execute(context, input);
  assert.deepEqual(receipt, { operationKey: input.operationKey, journalEntryId: "journal-1", replayed: true });
});

test("the posting adapter maps source, rules, period, and idempotency conflicts without retrying", async () => {
  const cases = [
    ["SOURCE_CHANGED", "ACCOUNTING_INTEGRATION_SOURCE_CHANGED"],
    ["RULESET_CHANGED", "ACCOUNTING_INTEGRATION_RULESET_CHANGED"],
    ["PERIOD_CLOSED", "ACCOUNTING_INTEGRATION_PERIOD_CLOSED"],
    ["IDEMPOTENCY_CONFLICT", "ACCOUNTING_INTEGRATION_IDEMPOTENCY_CONFLICT"],
    ["NATIVE_PAYROLL_ACCOUNTING_PLAN_VALUES_UNTRUSTED", "ACCOUNTING_INTEGRATION_SOURCE_CHANGED"],
  ] as const;
  for (const [message, code] of cases) {
    let calls = 0;
    const source: PayrollAccountingPostingSupabaseSource = { async rpc() { calls += 1; return { data: null, error: { message } }; } };
    await assert.rejects(
      () => new PostAccountingIntegration(new SupabasePayrollAccountingPoster(source)).execute(context, plan()),
      (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === code,
    );
    assert.equal(calls, 1);
  }
});

test("the posting adapter rejects malformed receipts and non-two-decimal VES plans before a transport call", async () => {
  const malformed: PayrollAccountingPostingSupabaseSource = { async rpc() { return { data: { operationKey: "wrong", journalEntryId: "", replayed: "yes" }, error: null }; } };
  await assert.rejects(
    () => new PostAccountingIntegration(new SupabasePayrollAccountingPoster(malformed)).execute(context, plan()),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE",
  );
  let calls = 0;
  const source: PayrollAccountingPostingSupabaseSource = { async rpc() { calls += 1; return { data: null, error: null }; } };
  const nonTwoDecimal = {
    ...plan(),
    lines: plan().lines.map((line, index) => index === 0 ? { ...line, amount: moneyFromDecimal("100.0000", VES_FOUR_DECIMALS) } : line),
  };
  await assert.rejects(
    () => new SupabasePayrollAccountingPoster(source).post(context, nonTwoDecimal),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_CURRENCY_INVALID",
  );
  assert.equal(calls, 0);
});

test("the reversal adapter serializes the immutable original reference and accepts an exact replay", async () => {
  const input = reversal();
  const source: PayrollAccountingPostingSupabaseSource = {
    async rpc(name, values) {
      assert.equal(name, "reverse_native_payroll_accounting_integration");
      assert.equal(values.p_actor_id, "actor-1");
      assert.equal(values.p_organization_id, "organization-1");
      assert.equal(values.p_company_id, "company-1");
      const payload = values.p_plan as { operationKey: string; originalOperationKey: string; reason: string; lines: Array<{ amount: string; side: string }> };
      assert.equal(payload.operationKey, input.operationKey);
      assert.equal(payload.originalOperationKey, input.originalOperationKey);
      assert.equal(payload.reason, "Payroll correction");
      assert.deepEqual(payload.lines.map((line) => line.amount), ["100.00", "100.00", "10.00", "10.00", "90.00", "90.00"]);
      assert.equal(payload.lines[0]?.side, "credit");
      return { data: { operationKey: input.operationKey, journalEntryId: "reversal-1", replayed: true }, error: null };
    },
  };
  const receipt = await new ReverseAccountingIntegration(new SupabasePayrollAccountingPoster(source)).execute(context, input);
  assert.deepEqual(receipt, { operationKey: input.operationKey, journalEntryId: "reversal-1", replayed: true });
});

test("the reversal adapter maps original, period, and reversal conflicts without retrying", async () => {
  const cases = [
    ["NATIVE_PAYROLL_ACCOUNTING_POST_NOT_FOUND", "ACCOUNTING_INTEGRATION_ORIGINAL_OPERATION_NOT_FOUND"],
    ["NATIVE_PAYROLL_ACCOUNTING_REVERSAL_PLAN_UNTRUSTED", "ACCOUNTING_INTEGRATION_ORIGINAL_OPERATION_INVALID"],
    ["PERIOD_CLOSED", "ACCOUNTING_INTEGRATION_PERIOD_CLOSED"],
    ["REVERSAL_CONFLICT", "ACCOUNTING_INTEGRATION_REVERSAL_CONFLICT"],
    ["ACCESS_DENIED", "ACCOUNTING_INTEGRATION_ACCESS_DENIED"],
    ["INVALID_REVERSAL", "ACCOUNTING_INTEGRATION_SOURCE_INVALID"],
  ] as const;
  for (const [message, code] of cases) {
    let calls = 0;
    const source: PayrollAccountingPostingSupabaseSource = { async rpc() { calls += 1; return { data: null, error: { message } }; } };
    await assert.rejects(
      () => new ReverseAccountingIntegration(new SupabasePayrollAccountingPoster(source)).execute(context, reversal()),
      (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === code,
    );
    assert.equal(calls, 1);
  }
});

test("the reversal adapter rejects malformed receipts and purchasing sources without calling Supabase", async () => {
  const malformed: PayrollAccountingPostingSupabaseSource = { async rpc() { return { data: { operationKey: "wrong", journalEntryId: "", replayed: false }, error: null }; } };
  await assert.rejects(
    () => new ReverseAccountingIntegration(new SupabasePayrollAccountingPoster(malformed)).execute(context, reversal()),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE",
  );
  let calls = 0;
  const source: PayrollAccountingPostingSupabaseSource = { async rpc() { calls += 1; return { data: null, error: null }; } };
  const purchasing = { ...reversal(), source: "purchasing.invoice_confirmed" as const };
  await assert.rejects(
    () => new SupabasePayrollAccountingPoster(source).reverse(context, purchasing),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_SOURCE_INVALID",
  );
  assert.equal(calls, 0);
});
