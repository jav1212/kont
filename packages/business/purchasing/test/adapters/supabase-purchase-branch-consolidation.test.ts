import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PurchaseBranchConsolidationFailure,
  type PurchaseBranchConsolidationQuery,
} from "../../src/application";
import { SupabasePurchaseBranchConsolidationReader } from "../../src/adapters/supabase";

const branch = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const requested = {
  actorUserId: "actor",
  organizationId: "organization",
  companyId: "company",
  from: "2026-01-01",
  to: "2026-01-31",
  branchIds: [branch],
} as never as PurchaseBranchConsolidationQuery;
const data = {
  period: { from: requested.from, to: requested.to },
  rows: [{
    branchId: branch, branchCode: "HQ", branchName: "Headquarters", documentType: "purchase_invoice",
    transactionCurrencyCode: "USD", documentCount: 2, functionalSubtotal: "100.00",
    functionalVatAmount: "16.00", functionalTotal: "116.00", functionalCurrency: "VES",
  }],
  coverage: { attributedConfirmedDocumentCount: 2, unattributedConfirmedDocumentCount: null, includesUnattributed: false },
  generatedAt: "2026-09-28T20:00:00.000Z",
};

function reader(reply: { readonly data: unknown; readonly error: { readonly message: string } | null }): SupabasePurchaseBranchConsolidationReader {
  const client = { async rpc() { return reply; } } as unknown as SupabaseClient;
  return new SupabasePurchaseBranchConsolidationReader(client);
}

test("purchase branch adapter calls the scoped RPC and decodes exact functional VES totals", async () => {
  const result = await reader({ data, error: null }).read(requested);

  assert.equal(result.rows[0]?.functionalTotal, "116");
  assert.equal(result.rows[0]?.functionalCurrency, "VES");
  assert.equal(result.rows[0]?.transactionCurrencyCode, "USD");
  assert.equal(Object.isFrozen(result.rows), true);
});

test("purchase branch adapter maps authorization errors and rejects malformed RPC data", async () => {
  await assert.rejects(
    reader({ data: null, error: { message: "PURCHASE_BRANCH_CONSOLIDATION_ACCESS_DENIED" } }).read(requested),
    (error: unknown) => error instanceof PurchaseBranchConsolidationFailure && error.code === "PURCHASE_BRANCH_CONSOLIDATION_ACCESS_DENIED",
  );
  await assert.rejects(
    reader({ data: { ...data, rows: [{ ...data.rows[0], functionalTotal: "not-a-decimal" }] }, error: null }).read(requested),
    (error: unknown) => error instanceof PurchaseBranchConsolidationFailure && error.code === "PURCHASE_BRANCH_CONSOLIDATION_UNAVAILABLE",
  );
});
