import assert from "node:assert/strict";
import test from "node:test";
import {
  GetPurchaseBranchConsolidation,
  PurchaseBranchConsolidationFailure,
  type PurchaseBranchConsolidationQuery,
  type PurchaseBranchConsolidationReader,
} from "../../src/application";

const branchA = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const branchB = "6be10ba0-d5d3-4a61-a34f-73d0c81a2346";
const query = {
  actorUserId: "actor",
  organizationId: "organization",
  companyId: "company",
  from: "2026-01-01",
  to: "2026-01-31",
  branchIds: [branchB, branchA, branchA],
} as never as PurchaseBranchConsolidationQuery;
const snapshot = {
  period: { from: query.from, to: query.to },
  rows: [],
  coverage: { attributedConfirmedDocumentCount: 0, unattributedConfirmedDocumentCount: null, includesUnattributed: false },
  generatedAt: "2026-09-28T20:00:00.000Z",
};

test("purchase branch consolidation normalizes unique branch IDs before the read", async () => {
  let received: PurchaseBranchConsolidationQuery | undefined;
  const reader: PurchaseBranchConsolidationReader = { async read(value) { received = value; return snapshot; } };

  const result = await new GetPurchaseBranchConsolidation(reader).execute(query);

  assert.deepEqual(received?.branchIds, [branchA, branchB]);
  assert.equal(result.period.from, "2026-01-01");
});

test("purchase branch consolidation rejects invalid periods and branch filters", async () => {
  const reader: PurchaseBranchConsolidationReader = { async read() { return snapshot; } };
  const useCase = new GetPurchaseBranchConsolidation(reader);

  await assert.rejects(useCase.execute({ ...query, from: "2026-02-30" }), invalid);
  await assert.rejects(useCase.execute({ ...query, to: "2027-01-02" }), invalid);
  await assert.rejects(useCase.execute({ ...query, branchIds: ["HQ"] }), invalid);
});

test("purchase branch consolidation preserves typed authorization failures", async () => {
  const reader: PurchaseBranchConsolidationReader = {
    async read() { throw new PurchaseBranchConsolidationFailure("PURCHASE_BRANCH_CONSOLIDATION_ACCESS_DENIED", "denied"); },
  };

  await assert.rejects(new GetPurchaseBranchConsolidation(reader).execute(query), (error: unknown) =>
    error instanceof PurchaseBranchConsolidationFailure && error.code === "PURCHASE_BRANCH_CONSOLIDATION_ACCESS_DENIED");
});

function invalid(error: unknown): boolean {
  return error instanceof PurchaseBranchConsolidationFailure && error.code === "PURCHASE_BRANCH_CONSOLIDATION_INVALID";
}
