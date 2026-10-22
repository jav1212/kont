import assert from "node:assert/strict";
import test from "node:test";
import { currency, moneyFromDecimal } from "@kontave/monetary/domain";
import {
  AccountingIntegrationFailure,
  PostAccountingIntegration,
  ReadActivePurchaseAccountingRuleSet,
  ReverseAccountingIntegration,
  planAccountingIntegrationReversal,
  planPurchaseInvoiceConfirmedIntegration,
} from "../../src";
import {
  SupabasePurchaseAccountingPoster,
  SupabasePurchaseAccountingRuleSetReader,
  type PurchaseAccountingPostingSupabaseSource,
  type PurchaseAccountingRuleSetSupabaseSource,
} from "../../src/adapters/supabase";

const VES = currency("VES", 2);
const USD = currency("USD", 2);
const context = { actorId: "actor-1", tenantId: "tenant-1", organizationId: "organization-1", companyId: "company-1" };

function plan() {
  return planPurchaseInvoiceConfirmedIntegration(
    {
      source: "purchasing.invoice_confirmed",
      tenantId: "tenant-1",
      organizationId: "organization-1",
      companyId: "company-1",
      purchaseInvoiceId: "invoice-1",
      purchaseInvoiceVersion: 3,
      effectiveDate: "2026-10-15",
      occurredAt: "2026-10-15T18:00:00.000Z",
      recognizedInventoryCost: moneyFromDecimal("250.50", VES),
    },
    {
      source: "purchasing.invoice_confirmed",
      version: "rules-v1",
      rules: [{ id: "inventory", version: "1", amountField: "recognized_inventory_cost", debitAccountId: "asset:inventory", creditAccountId: "liability:supplier" }],
    },
  );
}

function reversal() {
  return planAccountingIntegrationReversal(plan(), {
    effectiveDate: "2026-10-16",
    occurredAt: "2026-10-16T18:00:00.000Z",
    reason: "Purchase correction",
  });
}

test("the purchase rule adapter sends only authorized scope and returns a typed active mapping", async () => {
  const source: PurchaseAccountingRuleSetSupabaseSource = {
    async rpc(name, values) {
      assert.equal(name, "get_native_purchase_accounting_rule_set");
      assert.deepEqual(values, { p_actor_id: "actor-1", p_organization_id: "organization-1", p_company_id: "company-1" });
      return { data: { source: "purchasing.invoice_confirmed", version: "rules-v1", rules: [{ id: "inventory", version: "1", amountField: "recognized_inventory_cost", debitAccountId: "asset:inventory", creditAccountId: "liability:supplier" }] }, error: null };
    },
  };
  const result = await new ReadActivePurchaseAccountingRuleSet(new SupabasePurchaseAccountingRuleSetReader(source)).execute(context);
  assert.deepEqual(result, { source: "purchasing.invoice_confirmed", version: "rules-v1", rules: [{ id: "inventory", version: "1", amountField: "recognized_inventory_cost", debitAccountId: "asset:inventory", creditAccountId: "liability:supplier" }] });
  assert.equal(Object.isFrozen(result), true);
});

test("the purchase rule adapter rejects unsupported mappings and maps no active rules", async () => {
  const malformed: PurchaseAccountingRuleSetSupabaseSource = { async rpc() { return { data: { source: "purchasing.invoice_confirmed", version: "1", rules: [{ id: "inventory", amountField: "unknown" }] }, error: null }; } };
  await assert.rejects(
    () => new ReadActivePurchaseAccountingRuleSet(new SupabasePurchaseAccountingRuleSetReader(malformed)).execute(context),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_RULE_INVALID",
  );
  const empty: PurchaseAccountingRuleSetSupabaseSource = { async rpc() { return { data: null, error: { message: "NO_ACTIVE_RULES" } }; } };
  await assert.rejects(
    () => new ReadActivePurchaseAccountingRuleSet(new SupabasePurchaseAccountingRuleSetReader(empty)).execute(context),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_RULESET_INVALID",
  );
});

test("the purchase posting adapter preserves VES strings and exact replay receipts", async () => {
  const input = plan();
  const source: PurchaseAccountingPostingSupabaseSource = {
    async rpc(name, values) {
      assert.equal(name, "post_native_purchase_accounting_integration");
      assert.equal(values.p_actor_id, "actor-1");
      assert.equal(values.p_organization_id, "organization-1");
      assert.equal(values.p_company_id, "company-1");
      const payload = values.p_plan as { source: string; sourceVersion: number; lines: Array<{ amount: string }> };
      assert.equal(payload.source, "purchasing.invoice_confirmed");
      assert.equal(payload.sourceVersion, 3);
      assert.deepEqual(payload.lines.map((line) => line.amount), ["250.50", "250.50"]);
      return { data: { operationKey: input.operationKey, journalEntryId: "journal-1", replayed: true }, error: null };
    },
  };
  const receipt = await new PostAccountingIntegration(new SupabasePurchaseAccountingPoster(source)).execute(context, input);
  assert.deepEqual(receipt, { operationKey: input.operationKey, journalEntryId: "journal-1", replayed: true });
});

test("the purchase posting adapter maps source, rule, period and idempotency conflicts once", async () => {
  const cases = [
    ["SOURCE_CHANGED", "ACCOUNTING_INTEGRATION_SOURCE_CHANGED"],
    ["RULESET_CHANGED", "ACCOUNTING_INTEGRATION_RULESET_CHANGED"],
    ["PERIOD_CLOSED", "ACCOUNTING_INTEGRATION_PERIOD_CLOSED"],
    ["IDEMPOTENCY_CONFLICT", "ACCOUNTING_INTEGRATION_IDEMPOTENCY_CONFLICT"],
    ["NATIVE_PURCHASE_ACCOUNTING_PLAN_VALUES_UNTRUSTED", "ACCOUNTING_INTEGRATION_SOURCE_CHANGED"],
    ["PURCHASE_ACCOUNTING_SNAPSHOT_FRACTIONAL_CENT", "ACCOUNTING_INTEGRATION_AMOUNT_INVALID"],
    ["NATIVE_PURCHASE_ACCOUNTING_NO_ACTIVE_RULES", "ACCOUNTING_INTEGRATION_RULESET_INVALID"],
    ["NATIVE_PURCHASE_ACCOUNTING_RULE_INVALID", "ACCOUNTING_INTEGRATION_RULESET_INVALID"],
  ] as const;
  for (const [message, code] of cases) {
    let calls = 0;
    const source: PurchaseAccountingPostingSupabaseSource = { async rpc() { calls += 1; return { data: null, error: { message } }; } };
    await assert.rejects(
      () => new PostAccountingIntegration(new SupabasePurchaseAccountingPoster(source)).execute(context, plan()),
      (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === code,
    );
    assert.equal(calls, 1);
  }
});

test("the purchase adapter rejects a foreign source and non-VES plans before transport", async () => {
  let calls = 0;
  const source: PurchaseAccountingPostingSupabaseSource = { async rpc() { calls += 1; return { data: null, error: null }; } };
  await assert.rejects(
    () => new SupabasePurchaseAccountingPoster(source).post(context, { ...plan(), source: "payroll.run_confirmed" }),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_SOURCE_INVALID",
  );
  const usdPlan = { ...plan(), lines: plan().lines.map((line, index) => index === 0 ? { ...line, amount: moneyFromDecimal("250.50", USD) } : line) };
  await assert.rejects(
    () => new SupabasePurchaseAccountingPoster(source).post(context, usdPlan),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_CURRENCY_INVALID",
  );
  assert.equal(calls, 0);
});

test("the purchase reversal adapter serializes immutable evidence and maps conflicts", async () => {
  const input = reversal();
  const source: PurchaseAccountingPostingSupabaseSource = {
    async rpc(name, values) {
      assert.equal(name, "reverse_native_purchase_accounting_integration");
      const payload = values.p_plan as { originalOperationKey: string; lines: Array<{ amount: string; side: string }> };
      assert.equal(payload.originalOperationKey, input.originalOperationKey);
      assert.deepEqual(payload.lines.map((line) => line.amount), ["250.50", "250.50"]);
      assert.equal(payload.lines[0]?.side, "credit");
      return { data: { operationKey: input.operationKey, journalEntryId: "reversal-1", replayed: false }, error: null };
    },
  };
  assert.deepEqual(await new ReverseAccountingIntegration(new SupabasePurchaseAccountingPoster(source)).execute(context, input), { operationKey: input.operationKey, journalEntryId: "reversal-1", replayed: false });
  const conflict: PurchaseAccountingPostingSupabaseSource = { async rpc() { return { data: null, error: { message: "REVERSAL_CONFLICT" } }; } };
  await assert.rejects(
    () => new ReverseAccountingIntegration(new SupabasePurchaseAccountingPoster(conflict)).execute(context, input),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_REVERSAL_CONFLICT",
  );
});
