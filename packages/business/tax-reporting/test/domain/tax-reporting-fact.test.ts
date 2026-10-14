import assert from "node:assert/strict";
import test from "node:test";
import { moneyFromDecimal } from "@kontave/monetary/domain";
import { TaxReportingFailure, taxReportingFact } from "../../src/domain";
import { taxReportingFactFixture } from "../../src/testing";

test("a historical fact preserves its exact snapshot and forbids a delivery note", () => {
  const fact = taxReportingFactFixture();
  assert.equal(fact.signed.taxAmount.minorAmount, 1600n);
  assert.throws(() => taxReportingFact({ ...fact, source: { ...fact.source, kind: "legacy_delivery_note" } }), TaxReportingFailure);
});

test("a deduction cannot exceed tax and corrections require their affected fact", () => {
  const fact = taxReportingFactFixture();
  assert.throws(() => taxReportingFact({ ...fact, deductible: { ...fact.deductible, amount: moneyFromDecimal("17", fact.currency) } }));
  assert.throws(() => taxReportingFact({ ...fact, documentKind: "credit_note", affectedFactId: null }));
  const credit = taxReportingFactFixture({
    id: "credit-1", documentKind: "credit_note", affectedFactId: "original-fact", affectedSourceId: "original-purchase",
    signed: { taxableBase: moneyFromDecimal("-100", fact.currency), taxAmount: moneyFromDecimal("-16", fact.currency), exemptBase: moneyFromDecimal("0", fact.currency), total: moneyFromDecimal("-116", fact.currency) },
    rateBreakdowns: [{ rate: "16", category: "taxable", taxableBase: moneyFromDecimal("-100", fact.currency), taxAmount: moneyFromDecimal("-16", fact.currency), ruleVersion: null }],
    deductible: { state: "eligible", amount: moneyFromDecimal("-16", fact.currency), reason: null },
  });
  assert.equal(credit.signed.taxAmount.minorAmount, -1600n);
  assert.throws(() => taxReportingFact({ ...credit, signed: { ...credit.signed, taxAmount: fact.signed.taxAmount }, rateBreakdowns: [{ ...credit.rateBreakdowns[0]!, taxAmount: fact.signed.taxAmount }] }));
  assert.throws(() => taxReportingFact({ ...credit, documentKind: "debit_note" }));
  const debit = taxReportingFactFixture({ id: "debit-1", documentKind: "debit_note", affectedFactId: "original-fact", affectedSourceId: "original-purchase" });
  assert.equal(taxReportingFact(debit).signed.taxAmount.minorAmount, 1600n);
  const returned = taxReportingFactFixture({
    ...credit,
    id: "return-1",
    documentKind: "return",
    source: { kind: "custom", id: "return-document", lineageKey: "return:return-document" },
  });
  assert.equal(taxReportingFact(returned).signed.taxAmount.minorAmount, -1600n);
});

test("withholding evidence accepts an ISO instant and rejects malformed timestamps", () => {
  const fact = taxReportingFactFixture();
  const accepted = taxReportingFact({ ...fact, withholding: { kind: "practiced", amount: fact.signed.taxAmount, certificateReference: null, occurredAt: "2026-09-02T12:00:00.000Z" } });
  assert.equal(accepted.withholding?.kind, "practiced");
  assert.throws(() => taxReportingFact({ ...fact, withholding: { kind: "practiced", amount: fact.signed.taxAmount, certificateReference: null, occurredAt: "2026-09-02" } }));
});

test("facts reject impossible dates and recognition periods detached from recognition date", () => {
  const fact = taxReportingFactFixture();
  assert.throws(() => taxReportingFact({ ...fact, documentDate: "2026-02-31" }), TaxReportingFailure);
  assert.throws(() => taxReportingFact({ ...fact, period: "2026-08" }), TaxReportingFailure);
  assert.throws(() => taxReportingFact({ ...fact, recordedAt: "2026-02-31T12:00:00.000Z" }), TaxReportingFailure);
});

test("goods import facts require declaration, tariff, date, and paid-tax evidence", () => {
  const evidence = {
    kind: "goods" as const, declarationNumber: "DA-2026-001", declaredAt: "2026-09-02", paidAt: "2026-09-03T10:00:00Z", paymentReference: "PAY-001",
    authority: "SENIAT Aduana", tariffCode: "1006.30.00.00", reference: "receipt-1", relief: null,
  };
  const base = taxReportingFactFixture({
    source: { kind: "custom", id: "customs-entry-1", lineageKey: "import:customs-entry-1" },
    direction: "import",
    documentKind: "import_declaration",
    importEvidence: evidence,
  });
  assert.equal(base.importEvidence?.kind, "goods");
  assert.throws(() => taxReportingFact({ ...base, importEvidence: { ...evidence, tariffCode: "" } }));
});

test("foreign-service imports retain invoice, service, payment, and country evidence", () => {
  const fact = taxReportingFactFixture({
    source: { kind: "custom", id: "foreign-service-1", lineageKey: "foreign_service:foreign-service-1" },
    direction: "import",
    documentKind: "foreign_service_assessment",
    importEvidence: {
      kind: "foreign_service", invoiceReference: "INV-EXT-1", serviceDate: "2026-09-02", paidAt: "2026-09-03T10:00:00Z", paymentReference: "PAY-EXT-1",
      providerCountryCode: "US", relief: null,
    },
  });
  assert.equal(fact.importEvidence?.kind, "foreign_service");
  assert.throws(() => taxReportingFact({ ...fact, direction: "purchase" }));
});

test("exonerated import amounts require an explicit instrument and certificate reference", () => {
  const money = moneyFromDecimal;
  const evidence = {
    kind: "goods" as const, declarationNumber: "DA-2026-002", declaredAt: "2026-09-02", paidAt: "2026-09-03T10:00:00Z", paymentReference: "PAY-002",
    authority: "SENIAT Aduana", tariffCode: "1006.30.00.00", reference: null,
    relief: { legalInstrument: "Decreto 5.196", certificateReference: "COMEX-100", issuedAt: "2026-09-01" },
  };
  const fact = taxReportingFactFixture({
    source: { kind: "custom", id: "customs-exonerated-1", lineageKey: "import:customs-exonerated-1" },
    direction: "import",
    documentKind: "import_declaration",
    signed: { taxableBase: money("100", taxReportingFactFixture().currency), taxAmount: money("0", taxReportingFactFixture().currency), exemptBase: money("0", taxReportingFactFixture().currency), total: money("100", taxReportingFactFixture().currency) },
    rateBreakdowns: [{ rate: "16", category: "exonerated", taxableBase: money("100", taxReportingFactFixture().currency), taxAmount: money("0", taxReportingFactFixture().currency), ruleVersion: "reviewed-import-rule-v1" }],
    deductible: { state: "ineligible", amount: money("0", taxReportingFactFixture().currency), reason: "No tax charged." },
    importEvidence: evidence,
  });
  assert.equal(fact.importEvidence?.relief?.certificateReference, "COMEX-100");
  assert.throws(() => taxReportingFact({ ...fact, importEvidence: { ...evidence, relief: null } }));
});
