import assert from "node:assert/strict";
import test from "node:test";
import { ReviewLegacyVatSourcesBatch, type LegacyVatBatchReviewItem } from "../../src/application";
import type { RecordReviewedLegacyVatSource } from "../../src/application/record-reviewed-legacy-vat-source";
import type { TaxReportingFactBatchRepository } from "../../src/domain";
import { taxReportingFactFixture } from "../../src/testing";

test("batch review rejects issue facts and commits only eligible facts once", async () => {
  let writes = 0;
  let writtenIds: readonly string[] = [];
  const reviewer = { async review(input: LegacyVatBatchReviewItem) { const fact = taxReportingFactFixture({ id: input.sourceId, source: { kind: "legacy_purchase_invoice", id: input.sourceId, lineageKey: input.sourceId }, reconciliation: input.sourceId === "blocked" ? { state: "issue", reason: "missing evidence", expectedTaxAmount: null } : { state: "reconciled", reason: null, expectedTaxAmount: null } }); return fact; } } as unknown as RecordReviewedLegacyVatSource;
  const writer: TaxReportingFactBatchRepository = { async persistBatch(input) { writes += 1; writtenIds = input.facts.map(({ fact }) => fact.id); return { facts: input.facts.map(({ fact }) => fact), replayed: false }; } };
  const action = new ReviewLegacyVatSourcesBatch(reviewer, writer);
  const items = ["valid", "blocked"].map((sourceId) => ({ sourceId } as LegacyVatBatchReviewItem));
  const result = await action.execute({ scope: taxReportingFactFixture().scope, direction: "purchase", actorId: "reviewer", idempotencyKey: "batch-key-0001", items });
  assert.equal(writes, 1);
  assert.deepEqual(writtenIds, ["valid"]);
  assert.deepEqual(result.items.map(({ status }) => status), ["incorporated", "rejected"]);
  assert.match(result.items[1]?.reason ?? "", /missing evidence/);
});

test("batch review does not call persistence when all selected sources have blocking issues", async () => {
  let writes = 0;
  const reviewer = { async review(input: LegacyVatBatchReviewItem) { return taxReportingFactFixture({ id: input.sourceId, reconciliation: { state: "issue", reason: "pending", expectedTaxAmount: null } }); } } as unknown as RecordReviewedLegacyVatSource;
  const writer: TaxReportingFactBatchRepository = { async persistBatch() { writes += 1; return { facts: [], replayed: false }; } };
  const result = await new ReviewLegacyVatSourcesBatch(reviewer, writer).execute({ scope: taxReportingFactFixture().scope, direction: "purchase", actorId: "reviewer", idempotencyKey: "batch-key-0002", items: [{ sourceId: "one" } as LegacyVatBatchReviewItem] });
  assert.equal(writes, 0);
  assert.equal(result.items[0]?.status, "rejected");
});
