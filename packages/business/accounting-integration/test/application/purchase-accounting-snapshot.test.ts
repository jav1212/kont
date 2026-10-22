import assert from "node:assert/strict";
import test from "node:test";
import {
  AccountingIntegrationFailure,
  ReadConfirmedPurchaseAccountingSnapshot,
  planPurchaseInvoiceConfirmedIntegration,
  purchaseAccountingSnapshotToConfirmedEvent,
  type ConfirmedPurchaseAccountingSnapshot,
  type PurchaseAccountingRuleSet,
} from "../../src";
import { SupabasePurchaseAccountingSnapshotReader, type PurchaseAccountingSupabaseSource } from "../../src/adapters/supabase";

const query = { actorId: "actor-1", tenantId: "tenant-1", organizationId: "organization-1", companyId: "company-1", purchaseInvoiceId: "invoice-1" };
const rules: PurchaseAccountingRuleSet = {
  source: "purchasing.invoice_confirmed",
  version: "1",
  rules: [{ id: "inventory", version: "1", amountField: "recognized_inventory_cost", debitAccountId: "asset:inventory", creditAccountId: "liability:supplier" }],
};

function nativeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenantId: "tenant-1",
    organizationId: "organization-1",
    companyId: "company-1",
    invoiceId: "invoice-1",
    sourceVersion: 2,
    effectiveDate: "2026-10-15",
    confirmedAt: "2026-10-15T18:00:00.000Z",
    movementCount: 2,
    recognizedInventoryCost: "100.00",
    documentCurrency: "VES",
    ...overrides,
  };
}

function source(data: unknown, error: { message?: string; code?: string } | null = null): PurchaseAccountingSupabaseSource {
  return { async rpc(name, values) {
    assert.equal(name, "get_native_purchase_accounting_snapshot");
    assert.deepEqual(values, { p_actor_id: "actor-1", p_organization_id: "organization-1", p_company_id: "company-1", p_invoice_id: "invoice-1" });
    return { data, error };
  } };
}

test("a VES purchase snapshot retains its source revision and becomes a balanced inventory plan", async () => {
  const result = await new ReadConfirmedPurchaseAccountingSnapshot(
    new SupabasePurchaseAccountingSnapshotReader(source(nativeRow())),
  ).execute(query);
  const plan = planPurchaseInvoiceConfirmedIntegration(purchaseAccountingSnapshotToConfirmedEvent(result), rules);
  assert.equal(result.sourceVersion, 2);
  assert.equal(result.documentCurrency, "VES");
  assert.equal(result.recognizedInventoryCost.minorAmount, 10_000n);
  assert.equal(plan.sourceVersion, 2);
  assert.equal(plan.lines.filter((line) => line.side === "debit").reduce((total, line) => total + line.amount.minorAmount, 0n), 10_000n);
  assert.equal(plan.lines.filter((line) => line.side === "credit").reduce((total, line) => total + line.amount.minorAmount, 0n), 10_000n);
});

test("a USD document may supply a source-owned VES recognized cost without an implicit conversion", async () => {
  const result = await new ReadConfirmedPurchaseAccountingSnapshot(
    new SupabasePurchaseAccountingSnapshotReader(source(nativeRow({ documentCurrency: "USD", recognizedInventoryCost: "250.50" }))),
  ).execute(query);
  const event = purchaseAccountingSnapshotToConfirmedEvent(result);
  assert.equal(result.documentCurrency, "USD");
  assert.equal(event.recognizedInventoryCost.currency.code, "VES");
  assert.equal(event.recognizedInventoryCost.minorAmount, 25_050n);
});

test("foreign, missing, and malformed purchase evidence cannot reach the planner", async () => {
  const foreign = new SupabasePurchaseAccountingSnapshotReader(source(nativeRow({ companyId: "company-2" })));
  await assert.rejects(
    () => new ReadConfirmedPurchaseAccountingSnapshot(foreign).execute(query),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_SOURCE_INVALID",
  );
  const missingCost = new SupabasePurchaseAccountingSnapshotReader(source(nativeRow({ recognizedInventoryCost: undefined })));
  await assert.rejects(
    () => new ReadConfirmedPurchaseAccountingSnapshot(missingCost).execute(query),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_SOURCE_INVALID",
  );
  const malformed = new SupabasePurchaseAccountingSnapshotReader(source(nativeRow({ recognizedInventoryCost: "100" })));
  await assert.rejects(
    () => new ReadConfirmedPurchaseAccountingSnapshot(malformed).execute(query),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_SOURCE_INVALID",
  );
});

test("a zero source-owned cost is observable but cannot form a journal", async () => {
  const result = await new ReadConfirmedPurchaseAccountingSnapshot(
    new SupabasePurchaseAccountingSnapshotReader(source(nativeRow({ recognizedInventoryCost: "0.00" }))),
  ).execute(query);
  assert.equal(result.recognizedInventoryCost.minorAmount, 0n);
  assert.throws(
    () => planPurchaseInvoiceConfirmedIntegration(purchaseAccountingSnapshotToConfirmedEvent(result), rules),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_AMOUNT_INVALID",
  );
});

test("authorization and transport failures retain expected application errors", async () => {
  const denied = new SupabasePurchaseAccountingSnapshotReader(source(null, { message: "PURCHASE_ACCOUNTING_SNAPSHOT_ACCESS_DENIED" }));
  await assert.rejects(
    () => new ReadConfirmedPurchaseAccountingSnapshot(denied).execute(query),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_ACCESS_DENIED",
  );
  const fractionalCent = new SupabasePurchaseAccountingSnapshotReader(source(null, { message: "PURCHASE_ACCOUNTING_SNAPSHOT_FRACTIONAL_CENT" }));
  await assert.rejects(
    () => new ReadConfirmedPurchaseAccountingSnapshot(fractionalCent).execute(query),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_AMOUNT_INVALID",
  );
  for (const reason of ["PURCHASE_ACCOUNTING_SNAPSHOT_UNSUPPORTED", "PURCHASE_ACCOUNTING_SNAPSHOT_EMPTY"]) {
    const invalidSource = new SupabasePurchaseAccountingSnapshotReader(source(null, { message: reason }));
    await assert.rejects(
      () => new ReadConfirmedPurchaseAccountingSnapshot(invalidSource).execute(query),
      (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_SOURCE_INVALID",
    );
  }
  const unavailable = new SupabasePurchaseAccountingSnapshotReader({ async rpc() { throw new Error("network unavailable"); } });
  await assert.rejects(
    () => new ReadConfirmedPurchaseAccountingSnapshot(unavailable).execute(query),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE",
  );
});

test("the application rejects a missing complete trusted scope before it reads a source", async () => {
  let calls = 0;
  const reader = { async readConfirmed(): Promise<ConfirmedPurchaseAccountingSnapshot> { calls += 1; throw new Error("must not read"); } };
  await assert.rejects(
    () => new ReadConfirmedPurchaseAccountingSnapshot(reader).execute({ ...query, companyId: "" }),
    (error: unknown) => error instanceof AccountingIntegrationFailure && error.code === "ACCOUNTING_INTEGRATION_ACCESS_DENIED",
  );
  assert.equal(calls, 0);
});
