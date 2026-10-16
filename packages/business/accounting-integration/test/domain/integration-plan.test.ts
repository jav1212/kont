import assert from "node:assert/strict";
import test from "node:test";
import { currency, moneyFromDecimal } from "@kontave/monetary/domain";
import {
  AccountingIntegrationFailure,
  PostAccountingIntegration,
  planAccountingIntegrationReversal,
  planPayrollRunConfirmedIntegration,
  planPurchaseInvoiceConfirmedIntegration,
  type AccountingIntegrationPoster,
  type PayrollAccountingRuleSet,
} from "../../src";

const VES = currency("VES", 2);
const VES_FIVE_DECIMALS = currency("VES", 5);
const USD = currency("USD", 2);

const payrollRules: PayrollAccountingRuleSet = {
  source: "payroll.run_confirmed",
  version: "2026-10",
  rules: [
    { id: "wages", version: "1", amountField: "gross_earnings", debitAccountId: "expense:wages", creditAccountId: "liability:payroll" },
    { id: "deductions", version: "1", amountField: "employee_deductions", debitAccountId: "liability:payroll", creditAccountId: "liability:withholdings" },
    { id: "net-pay", version: "1", amountField: "net_pay", debitAccountId: "liability:payroll", creditAccountId: "liability:payable" },
    { id: "employer", version: "1", amountField: "employer_contributions", debitAccountId: "expense:contributions", creditAccountId: "liability:contributions" },
  ],
};

function payrollEvent() {
  return {
    source: "payroll.run_confirmed" as const,
    tenantId: "tenant-1",
    organizationId: "organization-1",
    companyId: "company-1",
    payrollRunId: "run-1",
    payrollRunVersion: 4,
    effectiveDate: "2026-10-15",
    occurredAt: "2026-10-15T18:00:00.000Z",
    grossEarnings: moneyFromDecimal("100.00", VES),
    employeeDeductions: moneyFromDecimal("10.00", VES),
    employerContributions: moneyFromDecimal("12.00", VES),
    netPay: moneyFromDecimal("90.00", VES),
  };
}

test("payroll planning produces an immutable balanced VES journal with a deterministic operation key", () => {
  const first = planPayrollRunConfirmedIntegration(payrollEvent(), payrollRules);
  const second = planPayrollRunConfirmedIntegration(payrollEvent(), payrollRules);

  assert.equal(first.operationKey, "16:accounting-event|21:payroll.run_confirmed|8:tenant-1|14:organization-1|9:company-1|5:run-1|1:4");
  assert.equal(first.operationKey, second.operationKey);
  assert.equal(first.lines.filter((line) => line.side === "debit").reduce((sum, line) => sum + line.amount.minorAmount, 0n), 21_200n);
  assert.equal(first.lines.filter((line) => line.side === "credit").reduce((sum, line) => sum + line.amount.minorAmount, 0n), 21_200n);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.lines), true);
});

test("planning rejects foreign currency, negative amounts, and invalid mapping accounts", () => {
  assert.throws(
    () => planPayrollRunConfirmedIntegration({ ...payrollEvent(), grossEarnings: moneyFromDecimal("100.00", USD) }, payrollRules),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_CURRENCY_INVALID",
  );
  assert.throws(
    () => planPayrollRunConfirmedIntegration({ ...payrollEvent(), netPay: moneyFromDecimal("-1.00", VES) }, payrollRules),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_AMOUNT_INVALID",
  );
  assert.throws(
    () => planPayrollRunConfirmedIntegration({ ...payrollEvent(), netPay: moneyFromDecimal("1.00000", VES_FIVE_DECIMALS) }, payrollRules),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_CURRENCY_INVALID",
  );
  assert.throws(
    () => planPayrollRunConfirmedIntegration(payrollEvent(), { ...payrollRules, rules: [{ ...payrollRules.rules[0]!, creditAccountId: "expense:wages" }] }),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_RULE_INVALID",
  );
});

test("purchase invoice planning maps recognized VES cost to a balanced inventory payable journal", () => {
  const plan = planPurchaseInvoiceConfirmedIntegration(
    {
      source: "purchasing.invoice_confirmed",
      tenantId: "tenant-1",
      organizationId: "organization-1",
      companyId: "company-1",
      purchaseInvoiceId: "invoice-8",
      purchaseInvoiceVersion: 2,
      effectiveDate: "2026-10-01",
      occurredAt: "2026-10-01T13:00:00.000Z",
      recognizedInventoryCost: moneyFromDecimal("840.25", VES),
    },
    { source: "purchasing.invoice_confirmed", version: "purchase-2026", rules: [{ id: "inventory", version: "1", amountField: "recognized_inventory_cost", debitAccountId: "asset:inventory", creditAccountId: "liability:supplier" }] },
  );
  assert.equal(plan.lines.length, 2);
  assert.equal(plan.lines[0]?.amount.minorAmount, 84_025n);
  assert.equal(plan.lines[1]?.side, "credit");
});

test("a reversal produces a distinct operation and opposite journal lines while preserving the original reference", () => {
  const original = planPayrollRunConfirmedIntegration(payrollEvent(), payrollRules);
  const reversal = planAccountingIntegrationReversal(original, {
    effectiveDate: "2026-10-16",
    occurredAt: "2026-10-16T18:00:00.000Z",
    reason: "Payroll correction",
  });
  assert.equal(reversal.originalOperationKey, original.operationKey);
  assert.equal(reversal.operationKey, `${original.operationKey}:reversal`);
  assert.equal(reversal.lines[0]?.side, "credit");
  assert.equal(original.lines[0]?.side, "debit");
});

test("the posting use case preserves the adapter replay receipt for an exact deterministic operation", async () => {
  const plan = planPayrollRunConfirmedIntegration(payrollEvent(), payrollRules);
  const poster: Pick<AccountingIntegrationPoster, "post"> = {
    async post(_context, input) { return { operationKey: input.operationKey, journalEntryId: "journal-1", replayed: true }; },
  };
  const receipt = await new PostAccountingIntegration(poster).execute({ actorId: "actor-1", tenantId: "tenant-1", organizationId: "organization-1", companyId: "company-1" }, plan);
  assert.deepEqual(receipt, { operationKey: plan.operationKey, journalEntryId: "journal-1", replayed: true });
});

test("planning rejects unreconciled payroll totals and mixed VES minor-unit scales", () => {
  assert.throws(
    () => planPayrollRunConfirmedIntegration({ ...payrollEvent(), netPay: moneyFromDecimal("89.99", VES) }, payrollRules),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_AMOUNT_INVALID",
  );
  const VES_FOUR_DECIMALS = currency("VES", 4);
  assert.throws(
    () => planPayrollRunConfirmedIntegration({ ...payrollEvent(), netPay: moneyFromDecimal("90.0000", VES_FOUR_DECIMALS) }, payrollRules),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_CURRENCY_INVALID",
  );
});

test("posting refuses a trusted context outside the immutable plan scope", async () => {
  const plan = planPayrollRunConfirmedIntegration(payrollEvent(), payrollRules);
  const poster: Pick<AccountingIntegrationPoster, "post"> = { async post() { throw new Error("must not post"); } };
  await assert.rejects(
    () => new PostAccountingIntegration(poster).execute({ actorId: "actor-1", tenantId: "tenant-2", organizationId: "organization-1", companyId: "company-1" }, plan),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_ACCESS_DENIED",
  );
});
