import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SalesBranchConsolidationFailure } from "../../src/application/branch-consolidation";
import { SupabaseSalesBranchConsolidationReader } from "../../src/adapters/supabase/sales-branch-consolidation";

const branch = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const requested = { actorUserId: "actor", organizationId: "org", companyId: "company", from: "2026-01-01", to: "2026-01-31", branchIds: [branch] };
const data = { period: { from: requested.from, to: requested.to }, rows: [{ branchId: branch, branchCode: "HQ", branchName: "Headquarters", documentType: "venta", currencyCode: "VES", documentCount: 2, subtotal: "100.00", vatAmount: "16.00", total: "116.00" }], coverage: { attributedConfirmedDocumentCount: 2, unattributedConfirmedDocumentCount: null, includesUnattributed: false }, generatedAt: "2026-09-28T20:00:00.000Z" };

function reader(reply: { readonly data: unknown; readonly error: { readonly message: string } | null }) {
  const client = { async rpc() { return reply; } } as unknown as SupabaseClient;
  return new SupabaseSalesBranchConsolidationReader(client);
}

test("sales branch consolidation adapter calls the scoped RPC and decodes exact totals", async () => {
  const result = await reader({ data, error: null }).read(requested);
  assert.equal(result.rows[0]?.total, "116.00");
  assert.equal(result.rows[0]?.branchId, branch);
  assert.equal(result.coverage.unattributedConfirmedDocumentCount, null);
});

test("sales branch consolidation adapter maps access denial and rejects malformed scope responses", async () => {
  await assert.rejects(reader({ data: null, error: { message: "SALES_BRANCH_CONSOLIDATION_ACCESS_DENIED" } }).read(requested), (error: unknown) => error instanceof SalesBranchConsolidationFailure && error.code === "SALES_BRANCH_CONSOLIDATION_ACCESS_DENIED");
  await assert.rejects(reader({ data: { ...data, period: { from: "2026-01-02", to: requested.to } }, error: null }).read(requested), (error: unknown) => error instanceof SalesBranchConsolidationFailure && error.code === "SALES_BRANCH_CONSOLIDATION_UNAVAILABLE");
});
