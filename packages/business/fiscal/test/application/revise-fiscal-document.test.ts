import assert from "node:assert/strict";
import test from "node:test";
import { ReviseFiscalDocument } from "../../src/application";
import { FiscalFailure, type FiscalDocumentRevisionRepository } from "../../src/domain";
import { fiscalInvoiceFixture } from "../../src/testing";

test("revision delegates source reconstruction and leaves CAS/replay ownership to persistence", async () => {
  const document = fiscalInvoiceFixture();
  const calls: string[] = [];
  const repository: FiscalDocumentRevisionRepository = {
    async findMetadata() { return { revision: 1, source: { kind: "legacy_sales_invoice", id: "sale-1" }, canRevise: true }; },
    async revise(input) { calls.push(input.idempotencyKey); return { document: input.replacement, revision: 2, replayed: false }; },
  };
  const useCase = new ReviseFiscalDocument(repository, { async reconstruct(input) { calls.push(input.sourceId); return { document, sourceUpdatedAt: "2026-09-28T00:00:00.000Z" }; } });
  const result = await useCase.execute({
    scope: { tenantId: "tenant", organizationId: "organization", companyId: document.companyId }, documentId: document.id,
    expectedRevision: 1, reason: "Se corrigieron los datos comerciales.", idempotencyKey: "revise-1", actorId: "actor", occurredAt: "2026-09-28T00:00:00.000Z",
  });
  assert.equal(result.revision, 2);
  assert.deepEqual(calls, ["sale-1", "revise-1"]);
});

test("revision rejects unsupported sources before reconstructing", async () => {
  const document = fiscalInvoiceFixture();
  const repository: FiscalDocumentRevisionRepository = {
    async findMetadata() { return { revision: 1, source: { kind: "other", id: "source" }, canRevise: false }; },
    async revise() { throw new Error("must not persist"); },
  };
  const useCase = new ReviseFiscalDocument(repository, { async reconstruct() { throw new Error("must not rebuild"); } });
  await assert.rejects(() => useCase.execute({
    scope: { tenantId: "tenant", organizationId: "organization", companyId: document.companyId }, documentId: document.id,
    expectedRevision: 1, reason: "razón", idempotencyKey: "key", actorId: "actor", occurredAt: "2026-09-28T00:00:00.000Z",
  }), (error: unknown) => error instanceof FiscalFailure && error.code === "FISCAL_DOCUMENT_SOURCE_CONFLICT");
});
