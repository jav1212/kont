import assert from "node:assert/strict";
import test from "node:test";
import { RecordImportTaxFact } from "../../src/application";
import type { TaxReportingFact, TaxReportingFactRepository } from "../../src/domain";
import { taxReportingFactFixture } from "../../src/testing";

test("import recording persists the reviewed snapshot with actor and idempotency unchanged", async () => {
  const saved: Array<{ readonly fact: TaxReportingFact; readonly actorId: string; readonly idempotencyKey: string }> = [];
  const repository: TaxReportingFactRepository = {
    async persist(input) { saved.push(input); return { fact: input.fact, replayed: false }; },
    async list() { return { items: [], nextCursor: null }; },
  };
  const fact = taxReportingFactFixture({
    source: { kind: "custom", id: "foreign-service-2", lineageKey: "foreign_service:foreign-service-2" },
    direction: "import",
    documentKind: "foreign_service_assessment",
    importEvidence: { kind: "foreign_service", invoiceReference: "INV-EXT-2", serviceDate: "2026-09-02", paidAt: "2026-09-03T10:00:00Z", paymentReference: "PAY-EXT-2", providerCountryCode: "US", relief: null },
  });
  const result = await new RecordImportTaxFact(repository).execute({ fact, actorId: "reviewer-1", idempotencyKey: "import-command-1" });
  assert.equal(result.fact.id, fact.id);
  assert.equal(saved[0]?.actorId, "reviewer-1");
  assert.equal(saved[0]?.idempotencyKey, "import-command-1");
});

test("import recording refuses an ordinary purchase fact before persistence", async () => {
  let persisted = false;
  const repository: TaxReportingFactRepository = {
    async persist(input) { persisted = true; return { fact: input.fact, replayed: false }; },
    async list() { return { items: [], nextCursor: null }; },
  };
  await assert.rejects(() => new RecordImportTaxFact(repository).execute({
    fact: taxReportingFactFixture(), actorId: "reviewer-1", idempotencyKey: "import-command-2",
  }));
  assert.equal(persisted, false);
});
