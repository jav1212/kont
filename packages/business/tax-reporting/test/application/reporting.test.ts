import assert from "node:assert/strict";
import test from "node:test";
import { currency, moneyFromDecimal } from "@kontave/monetary/domain";
import { BuildVatLedger, PersistTaxReportingFact, PrepareVatDeclaration, type VatDeclarationRepository } from "../../src/application";
import { TaxReportingFailure, type TaxReportingFactRepository } from "../../src/domain";
import { taxReportingFactFixture } from "../../src/testing";

test("the ledger aggregates dynamic historical rates and preserves pagination", async () => {
  const fact = taxReportingFactFixture();
  const repository: TaxReportingFactRepository = { async persist(input) { return { fact: input.fact, replayed: false }; }, async list() { return { items: [fact], nextCursor: { recognitionDate: "2026-09-01", id: "fact-1" } }; } };
  const page = await new BuildVatLedger(repository).execute(fact.scope, { from: "2026-09-01", to: "2026-09-30", limit: 20, cursor: null }, "actor");
  assert.equal(page.rateGroups[0]?.rate, "16"); assert.equal(page.nextCursor?.id, "fact-1");
});

test("the ledger keeps currencies and historical rule versions in separate rate groups", async () => {
  const initialFact = taxReportingFactFixture();
  const vesFact = taxReportingFactFixture({
    rateBreakdowns: [{ ...initialFact.rateBreakdowns[0]!, ruleVersion: "rule-v1" }],
  });
  const usd = currency("USD", 2);
  const usdMoney = (value: string) => moneyFromDecimal(value, usd);
  const usdFact = taxReportingFactFixture({
    id: "fact-usd",
    source: { ...vesFact.source, id: "purchase-usd", lineageKey: "purchase-usd" },
    currency: usd,
    signed: { taxableBase: usdMoney("100"), taxAmount: usdMoney("16"), exemptBase: usdMoney("0"), total: usdMoney("116") },
    rateBreakdowns: [{ rate: "16", category: "taxable", taxableBase: usdMoney("100"), taxAmount: usdMoney("16"), ruleVersion: "rule-v1" }],
    deductible: { state: "eligible", amount: usdMoney("16"), reason: null },
  });
  const newerRuleFact = taxReportingFactFixture({
    id: "fact-new-rule",
    source: { ...vesFact.source, id: "purchase-new-rule", lineageKey: "purchase-new-rule" },
    rateBreakdowns: [{ ...vesFact.rateBreakdowns[0]!, ruleVersion: "rule-v2" }],
  });
  const repository: TaxReportingFactRepository = {
    async persist(input) { return { fact: input.fact, replayed: false }; },
    async list() { return { items: [vesFact, usdFact, newerRuleFact], nextCursor: null }; },
  };
  const page = await new BuildVatLedger(repository).execute(vesFact.scope, { from: "2026-09-01", to: "2026-09-30", limit: 20, cursor: null }, "actor");
  assert.equal(page.rateGroups.length, 3);
  assert.deepEqual(page.rateGroups.map((group) => [group.ruleVersion, group.taxableBase.currency.code]), [
    ["rule-v1", "VES"], ["rule-v1", "USD"], ["rule-v2", "VES"],
  ]);
});

test("the ledger groups practiced and suffered withholdings from historical facts", async () => {
  const fact = taxReportingFactFixture();
  const practiced = taxReportingFactFixture({
    id: "fact-practiced", source: { ...fact.source, id: "purchase-practiced", lineageKey: "purchase-practiced" },
    withholding: { kind: "practiced", amount: moneyFromDecimal("12.5", fact.currency), certificateReference: "CERT-1", occurredAt: "2026-09-02T00:00:00.000Z" },
  });
  const suffered = taxReportingFactFixture({
    id: "fact-suffered", source: { ...fact.source, id: "purchase-suffered", lineageKey: "purchase-suffered" },
    withholding: { kind: "suffered", amount: moneyFromDecimal("7.25", fact.currency), certificateReference: "CERT-2", occurredAt: "2026-09-03T00:00:00.000Z" },
  });
  const repository: TaxReportingFactRepository = { async persist(input) { return { fact: input.fact, replayed: false }; }, async list() { return { items: [practiced, suffered], nextCursor: null }; } };
  const page = await new BuildVatLedger(repository).execute(fact.scope, { from: "2026-09-01", to: "2026-09-30", limit: 20, cursor: null }, "actor");
  assert.deepEqual(page.withholdingGroups.map((group) => [group.kind, group.amount.minorAmount]), [["practiced", 1250n], ["suffered", 725n]]);
});

test("declarations reject unreconciled or duplicate lineage instead of silently calculating", async () => {
  const fact = taxReportingFactFixture(); const repository: VatDeclarationRepository = { async save(input) { return { declaration: input.declaration, replayed: false }; } };
  const command = new PrepareVatDeclaration(repository); const base = { id: "declaration-1", scope: fact.scope, period: "2026-09", facts: [fact], template: { id: "internal-vat", version: "1", mapping: {} }, carryForwardIn: moneyFromDecimal("0", fact.currency), adjustments: moneyFromDecimal("0", fact.currency), actorId: "actor", idempotencyKey: "declaration-1", expectedRevision: null, createdAt: "2026-09-30T00:00:00.000Z" } as const;
  const result = await command.execute(base); assert.equal(result.declaration.summary.payable.minorAmount, -1600n);
  await assert.rejects(() => command.execute({ ...base, facts: [{ ...fact, reconciliation: { state: "issue", reason: "mismatch", expectedTaxAmount: fact.signed.taxAmount } }] }), (error: unknown) => error instanceof TaxReportingFailure);
});

test("declaration preparation rejects facts from another tenant before persistence", async () => {
  const fact = taxReportingFactFixture({ scope: { ...taxReportingFactFixture().scope, tenantId: "another-tenant" } });
  let saved = false;
  const repository: VatDeclarationRepository = { async save(input) { saved = true; return { declaration: input.declaration, replayed: false }; } };
  const command = new PrepareVatDeclaration(repository);
  await assert.rejects(
    () => command.execute({
      id: "declaration-scope", scope: taxReportingFactFixture().scope, period: fact.period, facts: [fact],
      template: { id: "internal-vat", version: "1", mapping: {} },
      carryForwardIn: moneyFromDecimal("0", fact.currency), adjustments: moneyFromDecimal("0", fact.currency),
      actorId: "actor", idempotencyKey: "declaration-scope", expectedRevision: null, createdAt: "2026-09-30T00:00:00.000Z",
    }),
    (error: unknown) => error instanceof TaxReportingFailure && error.code === "TAX_REPORTING_DECLARATION_INVALID",
  );
  assert.equal(saved, false);
});

test("declaration preparation maps mixed adjustment currency to a typed failure", async () => {
  const fact = taxReportingFactFixture();
  let saved = false;
  const repository: VatDeclarationRepository = { async save(input) { saved = true; return { declaration: input.declaration, replayed: false }; } };
  const command = new PrepareVatDeclaration(repository);
  await assert.rejects(
    () => command.execute({
      id: "declaration-currency", scope: fact.scope, period: fact.period, facts: [fact],
      template: { id: "internal-vat", version: "1", mapping: {} },
      carryForwardIn: moneyFromDecimal("0", fact.currency),
      adjustments: moneyFromDecimal("0", currency("USD", 2)),
      actorId: "actor", idempotencyKey: "declaration-currency", expectedRevision: null, createdAt: "2026-09-30T00:00:00.000Z",
    }),
    (error: unknown) => error instanceof TaxReportingFailure && error.code === "TAX_REPORTING_DECLARATION_INVALID",
  );
  assert.equal(saved, false);
});

test("persist validates actor and keeps repository idempotency responsibility", async () => {
  const fact = taxReportingFactFixture(); let called = false; const repository: TaxReportingFactRepository = { async persist(input) { called = true; return { fact: input.fact, replayed: true }; }, async list() { return { items: [], nextCursor: null }; } };
  const result = await new PersistTaxReportingFact(repository).execute({ fact, actorId: "actor", idempotencyKey: "fact-key" });
  assert.equal(called, true); assert.equal(result.replayed, true);
});
