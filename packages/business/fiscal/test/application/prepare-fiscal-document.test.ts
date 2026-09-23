import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { PrepareFiscalDocument } from "../../src/application";
import { FiscalFailure, type FiscalDocumentRepository } from "../../src";
import { fiscalInvoiceFixture } from "../../src/testing";

const scope = {
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: companyId("fiscal-company-1"),
} as const;

test("preparation persists only a draft owned by the requested company", async () => {
  const document = fiscalInvoiceFixture();
  let persisted = false;
  const repository: FiscalDocumentRepository = {
    async find() { return null; },
    async list() { return { items: [], nextCursor: null }; },
    async listEvents() { return { items: [], nextCursor: null }; },
    async persist(input) {
      persisted = true;
      return { document: input.document, replayed: false };
    },
    async appendIssuanceAttempt(_scope, attempt) { return attempt; },
  };

  const result = await new PrepareFiscalDocument(repository).execute({
    scope,
    source: { kind: "sale", id: "sale-1" },
    document,
    idempotencyKey: "prepare-sale-1",
    actorId: "user-1",
    occurredAt: "2026-09-22T12:00:00.000Z",
  });

  assert.equal(persisted, true);
  assert.equal(result.document, document);
  assert.equal(result.replayed, false);
});

test("preparation rejects an aggregate from another company before persistence", async () => {
  let persisted = false;
  const repository: FiscalDocumentRepository = {
    async find() { return null; },
    async list() { return { items: [], nextCursor: null }; },
    async listEvents() { return { items: [], nextCursor: null }; },
    async persist(input) {
      persisted = true;
      return { document: input.document, replayed: false };
    },
    async appendIssuanceAttempt(_scope, attempt) { return attempt; },
  };

  await assert.rejects(
    () => new PrepareFiscalDocument(repository).execute({
      scope: { ...scope, companyId: companyId("other-company") },
      source: { kind: "sale", id: "sale-1" },
      document: fiscalInvoiceFixture(),
      idempotencyKey: "prepare-sale-1",
      actorId: "user-1",
      occurredAt: "2026-09-22T12:00:00.000Z",
    }),
    (error: unknown) => error instanceof FiscalFailure && error.code === "FISCAL_DOCUMENT_INVALID",
  );
  assert.equal(persisted, false);
});
