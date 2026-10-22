import assert from "node:assert/strict";
import test from "node:test";
import { GetSalesBranchConsolidation, SalesBranchConsolidationFailure, type SalesBranchConsolidationReader } from "../../src/application/branch-consolidation";

const branchA = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const branchB = "6be10ba0-d5d3-4a61-a34f-73d0c81a2346";
const query = { actorUserId: "actor", organizationId: "org", companyId: "company", from: "2026-01-01", to: "2026-01-31", branchIds: [branchB, branchA, branchA] };
const snapshot = { period: { from: query.from, to: query.to }, rows: [], coverage: { attributedConfirmedDocumentCount: 0, unattributedConfirmedDocumentCount: null, includesUnattributed: false }, generatedAt: "2026-09-28T20:00:00.000Z" };

test("sales branch consolidation normalizes unique branch IDs before the read", async () => {
  let received: unknown;
  const reader: SalesBranchConsolidationReader = { async read(value) { received = value; return snapshot; } };
  const result = await new GetSalesBranchConsolidation(reader).execute(query);
  assert.deepEqual((received as typeof query).branchIds, [branchA, branchB]);
  assert.equal(result.period.from, "2026-01-01");
});

test("sales branch consolidation rejects invalid dates, oversized periods, and malformed branch IDs", async () => {
  const reader: SalesBranchConsolidationReader = { async read() { return snapshot; } };
  const useCase = new GetSalesBranchConsolidation(reader);
  await assert.rejects(useCase.execute({ ...query, from: "2026-02-30" }), (error: unknown) => error instanceof SalesBranchConsolidationFailure && error.code === "SALES_BRANCH_CONSOLIDATION_INVALID");
  await assert.rejects(useCase.execute({ ...query, to: "2027-01-02" }), (error: unknown) => error instanceof SalesBranchConsolidationFailure && error.code === "SALES_BRANCH_CONSOLIDATION_INVALID");
  await assert.rejects(useCase.execute({ ...query, branchIds: ["HQ"] }), (error: unknown) => error instanceof SalesBranchConsolidationFailure && error.code === "SALES_BRANCH_CONSOLIDATION_INVALID");
});

test("sales branch consolidation preserves typed authorization failures", async () => {
  const reader: SalesBranchConsolidationReader = { async read() { throw new SalesBranchConsolidationFailure("SALES_BRANCH_CONSOLIDATION_ACCESS_DENIED", "denied"); } };
  await assert.rejects(new GetSalesBranchConsolidation(reader).execute(query), (error: unknown) => error instanceof SalesBranchConsolidationFailure && error.code === "SALES_BRANCH_CONSOLIDATION_ACCESS_DENIED");
});
