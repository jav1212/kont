import assert from "node:assert/strict";
import test from "node:test";
import { decodeFact, encode, SupabaseTaxReportingRepository } from "../../src/adapters/supabase";
import { taxReportingFactFixture } from "../../src/testing";
import { TaxReportingFailure, vatDeclaration } from "../../src/domain";
import { fiscalDate, fiscalDocumentId, fiscalInstant, fiscalNumber } from "@kontave/fiscal/domain";
import { fiscalInvoiceFixture } from "@kontave/fiscal/testing";
import { fiscalDocumentTaxFact } from "../../src/application/fiscal-document-fact";
import { moneyFromMinor } from "@kontave/monetary/domain";
import { companyId } from "@kontave/companies/domain";
import { taxationDate } from "@kontave/taxation/domain";

test("JSON response encoding preserves exact bigint minor units as decimal strings", () => {
  const fact = taxReportingFactFixture();
  const json = JSON.parse(encode({ amount: fact.signed.taxAmount })) as { amount: { minorAmount: string } };
  assert.equal(json.amount.minorAmount, fact.signed.taxAmount.minorAmount.toString());
});

test("fact persistence round-trips reviewed counterparty evidence and reads pre-profile snapshots", () => {
  const profile = { companyId: companyId("company-1"), counterpartyId: "supplier-1", contributorStatus: "ordinary" as const, residenceStatus: "domestic" as const, effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null, legalBasis: "Supplier registry review", evidenceReference: "registry:2026:1", version: 1 };
  const fact = taxReportingFactFixture({ counterpartyFiscalProfile: profile });
  const encoded = JSON.parse(encode(fact)) as Record<string, unknown>;
  assert.deepEqual(decodeFact(encoded).counterpartyFiscalProfile, profile);
  const { counterpartyFiscalProfile: _profile, ...beforeProfileSnapshot } = encoded;
  assert.equal(decodeFact(beforeProfileSnapshot).counterpartyFiscalProfile, null);
});

test("legacy reader uses the scoped SQL cursor contract and decodes flat rows", async () => {
  let name = ""; let args: Record<string, unknown> | undefined;
  const client = { async rpc(nextName: string, nextArgs: Record<string, unknown>) { name = nextName; args = nextArgs; return { data: { documents: [{ id: "purchase-1", kind: "purchase_invoice", date: "2026-09-01", updatedAt: "2026-09-02T00:00:00Z", subtotal: "100.00", taxAmount: "16.00", total: "116.00", currency: "VES", affectedId: "original-invoice-1", lines: [{ rateCode: "reducida_8", base: "100.00", net: "16.00", included: false, taxAmount: "8.00", taxType: "IVA", taxValue: "8.00", taxConcept: "IVA" }] }], hasMore: true, nextCursor: { date: "2026-09-01", id: "purchase-1" } }, error: null }; } };
  const scope = taxReportingFactFixture().scope; const page = await new SupabaseTaxReportingRepository(client as never).readLegacyVatSources({ scope, actorId: "actor", direction: "purchase", from: "2026-09-01", to: "2026-09-30", cursor: JSON.stringify({ date: "2026-08-31", id: "previous" }), limit: 20 });
  assert.equal(name, "read_iva_legacy_sources"); assert.equal(args?.p_actor_user_id, "actor"); assert.equal(args?.p_after_date, "2026-08-31"); assert.equal(page.documents[0]?.header.taxAmount, "16.00"); assert.equal(page.documents[0]?.affectedId, "original-invoice-1"); assert.equal(page.documents[0]?.lines[0]?.taxAmount, "8.00"); assert.equal(page.documents[0]?.lines[0]?.taxType, "IVA"); assert.deepEqual(JSON.parse(page.nextCursor ?? "{}"), { date: "2026-09-01", id: "purchase-1" });
});

test("declaration adapter validates lifecycle evidence before it can call persistence", async () => {
  const fact = taxReportingFactFixture(); const money = fact.signed.taxAmount;
  const declaration = vatDeclaration({ id: "declaration-1", scope: fact.scope, period: "2026-09", revision: 1, status: "prepared", summary: { debitTax: money, deductibleCredit: money, withheldTax: money, carryForwardIn: money, adjustments: money, payable: money }, template: { id: "internal", version: "1", mapping: {} }, factIds: [], reconciliationIssueFactIds: [], submittedEvidence: null, payments: [], createdAt: "2026-09-30T00:00:00.000Z" });
  const client = { async rpc() { throw new Error("must not call RPC"); } };
  await assert.rejects(() => new SupabaseTaxReportingRepository(client as never).save({ declaration, actorId: " ", idempotencyKey: "key", expectedRevision: null }));
});

test("fact ledger listing forwards its authenticated actor to the scoped RPC", async () => {
  let args: Record<string, unknown> | undefined;
  const client = { async rpc(_name: string, nextArgs: Record<string, unknown>) { args = nextArgs; return { data: { items: [], nextCursor: null }, error: null }; } };
  const scope = taxReportingFactFixture().scope;
  const page = await new SupabaseTaxReportingRepository(client as never).list(scope, { from: "2026-09-01", to: "2026-09-30", limit: 10, cursor: null }, "actor");
  assert.equal(args?.p_actor_id, "actor"); assert.equal(page.items.length, 0);
});

test("missing reporting RPC is exposed as an unavailable database capability", async () => {
  const client = { async rpc() { return { data: null, error: { code: "PGRST202", message: "Could not find the function in the schema cache" } }; } };
  const scope = taxReportingFactFixture().scope;
  await assert.rejects(
    () => new SupabaseTaxReportingRepository(client as never).list(scope, { from: "2026-09-01", to: "2026-09-30", limit: 10, cursor: null }, "actor"),
    (error: unknown) => error instanceof TaxReportingFailure && error.code === "TAX_REPORTING_UNAVAILABLE",
  );
});

test("correction source integrity failures preserve their typed database outcome", async () => {
  const client = { async rpc() { return { data: null, error: { code: "P0001", message: "TAX_REPORTING_CORRECTION_SOURCE_INVALID" } }; } };
  const original = taxReportingFactFixture();
  const negate = (amount: ReturnType<typeof moneyFromMinor>) => moneyFromMinor(-amount.minorAmount, amount.currency);
  const correction = taxReportingFactFixture({
    id: "credit-fact-1", documentKind: "credit_note", affectedFactId: original.id, affectedSourceId: original.source.id,
    signed: { taxableBase: negate(original.signed.taxableBase), taxAmount: negate(original.signed.taxAmount), exemptBase: negate(original.signed.exemptBase), total: negate(original.signed.total) },
    rateBreakdowns: original.rateBreakdowns.map((item) => ({ ...item, taxableBase: negate(item.taxableBase), taxAmount: negate(item.taxAmount) })),
    deductible: { ...original.deductible, amount: negate(original.deductible.amount) },
  });
  await assert.rejects(
    () => new SupabaseTaxReportingRepository(client as never).persist({ fact: correction, actorId: "actor-1", idempotencyKey: "credit-command-1" }),
    (error: unknown) => error instanceof TaxReportingFailure && error.code === "TAX_REPORTING_CORRECTION_SOURCE_INVALID",
  );
});

test("correction amounts beyond the original fact preserve their typed database outcome", async () => {
  const client = { async rpc() { return { data: null, error: { code: "P0001", message: "TAX_REPORTING_CORRECTION_EXCEEDS_SOURCE" } }; } };
  const original = taxReportingFactFixture();
  const negate = (amount: ReturnType<typeof moneyFromMinor>) => moneyFromMinor(-amount.minorAmount, amount.currency);
  const correction = taxReportingFactFixture({
    id: "credit-exceeds-original",
    documentKind: "credit_note",
    affectedFactId: original.id,
    affectedSourceId: original.source.id,
    signed: { taxableBase: negate(original.signed.taxableBase), taxAmount: negate(original.signed.taxAmount), exemptBase: negate(original.signed.exemptBase), total: negate(original.signed.total) },
    rateBreakdowns: original.rateBreakdowns.map((rate) => ({ ...rate, taxableBase: negate(rate.taxableBase), taxAmount: negate(rate.taxAmount) })),
    deductible: { ...original.deductible, amount: negate(original.deductible.amount) },
  });
  await assert.rejects(
    () => new SupabaseTaxReportingRepository(client as never).persist({ fact: correction, actorId: "actor-1", idempotencyKey: "key" }),
    (error: unknown) => error instanceof TaxReportingFailure && error.code === "TAX_REPORTING_CORRECTION_EXCEEDS_SOURCE",
  );
});

test("accepted fiscal issuance and its fact are sent through the atomic RPC", async () => {
  let name = ""; let args: Record<string, unknown> | undefined;
  const client = { async rpc(nextName: string, nextArgs: Record<string, unknown>) { name = nextName; args = nextArgs; const snapshot = nextArgs.p_fact_snapshot; return { data: { fact_snapshot: snapshot, replayed: false }, error: null }; } };
  const baseScope = taxReportingFactFixture().scope;
  const document = fiscalInvoiceFixture({ id: fiscalDocumentId("issued-atomic-1"), status: "issued", direction: "issued", number: fiscalNumber("INV-ATOMIC-1"), issuedAt: fiscalInstant("2026-09-10T12:00:00.000Z"), issueDate: fiscalDate("2026-09-10") });
  const scope = { ...baseScope, companyId: document.companyId };
  const fact = fiscalDocumentTaxFact(document, scope, { factId: "fact-atomic-1", lineageKey: "sale:issued-atomic-1", recognitionDate: "2026-09-10", counterpartyCountryCode: "VE", affectedFactId: null, withholding: null, recordedAt: "2026-09-10T12:00:00.000Z" });
  const attempt = { id: "attempt-atomic-1", documentId: document.id, provider: "provider", idempotencyKey: "provider-key-1", state: "accepted" as const, requestFingerprint: "fingerprint", providerReference: "reference", failureCode: null, occurredAt: "2026-09-10T12:00:00.000Z", issuedDocument: document };
  const saved = await new SupabaseTaxReportingRepository(client as never).persistIssued({ attempt, fact, actorId: "actor-1", idempotencyKey: "fact-command-1" });
  assert.equal(name, "shared_fiscal_document_record_issuance_with_tax_fact");
  assert.equal(args?.p_actor_id, "actor-1");
  assert.equal(args?.p_fact_idempotency_key, "fact-command-1");
  assert.equal((args?.p_attempt as Record<string, unknown>).state, "accepted");
  assert.equal(saved.fact.id, "fact-atomic-1");
});

test("declaration history forwards both book scope and decodes a stable revision cursor", async () => {
  let name = ""; let args: Record<string, unknown> | undefined;
  const client = { async rpc(nextName: string, nextArgs: Record<string, unknown>) { name = nextName; args = nextArgs; return { data: { items: [], nextCursor: { period: "2026-06", id: "declaration-1", revision: 3 } }, error: null }; } };
  const scope = taxReportingFactFixture().scope;
  const page = await new SupabaseTaxReportingRepository(client as never).listDeclarations(scope, { fromPeriod: "2026-01", toPeriod: "2026-12", limit: 20, cursor: null }, "actor-1");
  assert.equal(name, "shared_tax_reporting_declaration_list");
  assert.equal(args?.p_actor_id, "actor-1");
  assert.equal(args?.p_from_period, "2026-01");
  assert.deepEqual(page.nextCursor, { period: "2026-06", id: "declaration-1", revision: 3 });
});
