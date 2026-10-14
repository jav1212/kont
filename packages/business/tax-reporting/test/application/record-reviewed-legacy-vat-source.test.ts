import assert from "node:assert/strict";
import test from "node:test";
import { currency, moneyFromDecimal } from "@kontave/monetary/domain";
import { taxCounterpartyFiscalProfile, type TaxCounterpartyFiscalProfile } from "@kontave/taxation/domain";
import { RecordReviewedLegacyVatSource } from "../../src/application";
import type { LegacyVatSourceReader, LegacyVatSourceRecord } from "../../src/application";
import { taxReportingFactFixture } from "../../src/testing";
import type { TaxReportingFactRepository } from "../../src/domain";

test("review command persists inconsistent legacy evidence with actor and idempotency", async () => {
  const base = taxReportingFactFixture();
  let saved: Parameters<TaxReportingFactRepository["persist"]>[0] | undefined;
  const repository: TaxReportingFactRepository = {
    async persist(input) { saved = input; return { fact: input.fact, replayed: false }; },
    async list() { return { items: [], nextCursor: null }; },
  };
  const source: LegacyVatSourceRecord = {
    id: "purchase-legacy-1",
    kind: "purchase_invoice",
    affectedId: null,
    documentDate: "2026-09-02",
    updatedAt: "2026-09-03T09:00:00.000Z",
    header: { currency: "VES", subtotal: "100.00", taxAmount: "16.00", total: "116.00", withheldAmount: "0.00", withholdingCertificate: null, counterpartyTaxId: "J-12345678-9", counterpartyName: "Proveedor" },
    lines: [{ rateCode: "historic", base: "100.00", net: "116.00", included: false, taxAmount: "0.00", taxType: "IVA", taxValue: "0.00", taxConcept: "IVA" }],
  };
  const VES = currency("VES", 2);
  const amount = (value: string) => moneyFromDecimal(value, VES);
  const reader: LegacyVatSourceReader = {
    async readLegacyVatSources(input) {
      assert.equal(input.actorId, "reviewer-1");
      assert.equal(input.direction, "purchase");
      return { documents: [source], hasMore: false, nextCursor: null };
    },
  };
  const result = await new RecordReviewedLegacyVatSource(repository, reader).execute({
    scope: base.scope,
    direction: "purchase",
    sourceId: source.id,
    from: "2026-09-01",
    to: "2026-09-30",
    seed: {
      id: "fact-legacy-1", scope: base.scope, recognitionDate: "2026-09-02", period: "2026-09",
      affectedFactId: null, deductible: base.deductible,
      recordedAt: "2026-09-03T10:00:00.000Z",
    },
    evidence: {
      currency: VES,
      exemptBase: amount("0"),
      historicalExemptBase: amount("0"),
      rates: [{ rate: "16", category: "taxable", taxableBase: amount("100"), taxAmount: amount("16"), ruleVersion: "reviewed" }],
    },
    actorId: "reviewer-1",
    idempotencyKey: "legacy-review-1",
  });

  assert.equal(result.fact.reconciliation.state, "issue");
  assert.equal(saved?.fact.id, "fact-legacy-1");
  assert.equal(saved?.actorId, "reviewer-1");
  assert.equal(saved?.idempotencyKey, "legacy-review-1");
});

test("review command snapshots the supplier profile effective on the source date", async () => {
  const base = taxReportingFactFixture();
  const profile = taxCounterpartyFiscalProfile({
    companyId: base.scope.companyId as TaxCounterpartyFiscalProfile["companyId"],
    counterpartyId: "supplier-1",
    contributorStatus: "formal",
    residenceStatus: "domestic",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    legalBasis: "Reviewed supplier record",
    evidenceReference: "SUP-001",
    version: 2,
  });
  const source: LegacyVatSourceRecord = {
    id: "purchase-legacy-profile",
    kind: "purchase_invoice",
    affectedId: null,
    documentDate: "2026-09-02",
    updatedAt: "2026-09-03T09:00:00.000Z",
    header: { currency: "VES", subtotal: "100.00", taxAmount: "16.00", total: "116.00", withheldAmount: "0.00", withholdingCertificate: null, counterpartyId: "supplier-1", counterpartyTaxId: "J-12345678-9", counterpartyName: "Proveedor" },
    lines: [{ rateCode: "historic", base: "100.00", net: "116.00", included: false, taxAmount: "16.00", taxType: "IVA", taxValue: "16.00", taxConcept: "IVA" }],
  };
  const amount = (value: string) => moneyFromDecimal(value, currency("VES", 2));
  const facts: TaxReportingFactRepository = {
    async persist(input) { return { fact: input.fact, replayed: false }; },
    async list() { return { items: [], nextCursor: null }; },
  };
  const sources: LegacyVatSourceReader = {
    async readLegacyVatSources() { return { documents: [source], hasMore: false, nextCursor: null }; },
  };
  let effectiveDate: string | undefined;
  const taxation = {
    async getCounterpartyFiscalProfile(_context: unknown, counterpartyId: string, date: string) {
      assert.equal(counterpartyId, "supplier-1");
      effectiveDate = date;
      return profile;
    },
    async getCompanyTaxRuleCatalog() { throw new Error("unused"); },
    async saveCompanyTaxRuleCatalog() { throw new Error("unused"); },
    async saveCounterpartyFiscalProfile() { throw new Error("unused"); },
  };
  const result = await new RecordReviewedLegacyVatSource(facts, sources, taxation).execute({
    scope: base.scope, direction: "purchase", sourceId: source.id, from: "2026-09-01", to: "2026-09-30",
    seed: {
      id: "fact-legacy-profile", scope: base.scope, recognitionDate: "2026-09-02", period: "2026-09",
      affectedFactId: null, deductible: { state: "eligible", amount: amount("16"), reason: null },
      recordedAt: "2026-09-03T10:00:00.000Z",
    },
    evidence: {
      currency: currency("VES", 2), exemptBase: amount("0"), historicalExemptBase: amount("0"),
      rates: [{ rate: "16", category: "taxable", taxableBase: amount("100"), taxAmount: amount("16"), ruleVersion: "reviewed" }],
    },
    actorId: "reviewer-1", idempotencyKey: "legacy-profile-1",
  });
  assert.equal(effectiveDate, "2026-09-02");
  assert.equal(result.fact.counterpartyFiscalProfile?.version, 2);
  assert.equal(result.fact.reconciliation.state, "reconciled");
});
