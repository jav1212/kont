import assert from "node:assert/strict";
import test from "node:test";
import { fiscalDate, fiscalInstant, fiscalNumber, fiscalDocumentId } from "@kontave/fiscal/domain";
import { fiscalInvoiceFixture } from "@kontave/fiscal/testing";
import { RecordFiscalDocumentTaxFact, RecordIssuedFiscalDocumentTaxFact, type IssuedFiscalDocumentTaxFactRepository } from "../../src/application";
import { TaxReportingFailure, type TaxReportingFactRepository } from "../../src/domain";

test("fiscal fact command persists a finalized snapshot through the idempotent reporting port", async () => {
  let persisted: Parameters<TaxReportingFactRepository["persist"]>[0] | undefined;
  const repository: TaxReportingFactRepository = {
    async persist(input) { persisted = input; return { fact: input.fact, replayed: true }; },
    async list() { return { items: [], nextCursor: null }; },
  };
  const scope = { tenantId: "tenant-1", organizationId: "organization-1", companyId: "fiscal-company-1" };
  const document = fiscalInvoiceFixture({ status: "issued", number: fiscalNumber("INV-1"), issuedAt: fiscalInstant("2026-09-10T12:00:00.000Z"), issueDate: fiscalDate("2026-09-10") });
  const metadata = { factId: "fact-1", lineageKey: "sale:legacy-document-1", recognitionDate: "2026-09-10", counterpartyCountryCode: "VE", affectedFactId: null, withholding: null, recordedAt: "2026-09-10T12:00:00.000Z" } as const;
  const result = await new RecordFiscalDocumentTaxFact(repository).execute({ document, scope, metadata, actorId: "actor-1", idempotencyKey: "post-fiscal-1" });
  assert.equal(result.replayed, true);
  assert.equal(result.fact.source.lineageKey, "sale:legacy-document-1");
  assert.equal(persisted?.actorId, "actor-1");
  assert.equal(persisted?.idempotencyKey, "post-fiscal-1");
  assert.equal(result.fact, persisted?.fact);
});

test("accepted issuance and its IVA fact cross one atomic persistence port", async () => {
  let committed: Parameters<IssuedFiscalDocumentTaxFactRepository["persistIssued"]>[0] | undefined;
  const repository: IssuedFiscalDocumentTaxFactRepository = {
    async persistIssued(input) { committed = input; return { fact: input.fact, replayed: false }; },
  };
  const scope = { tenantId: "tenant-1", organizationId: "organization-1", companyId: "fiscal-company-1" };
  const document = fiscalInvoiceFixture({ id: fiscalDocumentId("issued-1"), status: "issued", direction: "issued", number: fiscalNumber("INV-ISSUED-1"), issuedAt: fiscalInstant("2026-09-10T12:00:00.000Z"), issueDate: fiscalDate("2026-09-10") });
  const attempt = { id: "attempt-1", documentId: document.id, provider: "senIAT-adapter", idempotencyKey: "provider-issue-1", state: "accepted" as const, requestFingerprint: "fingerprint-1", providerReference: "receipt-1", failureCode: null, occurredAt: "2026-09-10T12:00:00.000Z", issuedDocument: document };
  const result = await new RecordIssuedFiscalDocumentTaxFact(repository).execute({
    attempt, scope,
    metadata: { factId: "fact-issued-1", lineageKey: "sale:issued-1", recognitionDate: "2026-09-10", counterpartyCountryCode: "VE", affectedFactId: null, withholding: null, recordedAt: "2026-09-10T12:00:00.000Z" },
    actorId: "actor-1", idempotencyKey: "report-issued-1",
  });
  assert.equal(result.fact.source.id, "issued-1");
  assert.equal(committed?.attempt.id, "attempt-1");
  assert.equal(committed?.fact.id, "fact-issued-1");
});

test("unaccepted issuance cannot be committed as a VAT fact", async () => {
  let called = false;
  const repository: IssuedFiscalDocumentTaxFactRepository = { async persistIssued() { called = true; throw new Error("must not call"); } };
  const document = fiscalInvoiceFixture({ status: "draft" });
  await assert.rejects(
    new RecordIssuedFiscalDocumentTaxFact(repository).execute({
      attempt: { id: "attempt-1", documentId: document.id, provider: "provider", idempotencyKey: "issue-1", state: "rejected", requestFingerprint: "fp", providerReference: null, failureCode: "rejected", occurredAt: "2026-09-10T12:00:00.000Z", issuedDocument: null },
      scope: { tenantId: "tenant-1", organizationId: "organization-1", companyId: "fiscal-company-1" },
      metadata: { factId: "fact-1", lineageKey: "sale:draft", recognitionDate: "2026-09-10", counterpartyCountryCode: "VE", affectedFactId: null, withholding: null, recordedAt: "2026-09-10T12:00:00.000Z" },
      actorId: "actor-1", idempotencyKey: "report-1",
    }),
    TaxReportingFailure,
  );
  assert.equal(called, false);
});
