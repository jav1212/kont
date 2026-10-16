import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PurchaseInvoiceBranchConfirmationFailure,
  type ConfirmPurchaseInvoiceForBranchCommand,
} from "../../src/application";
import { SupabasePurchaseInvoiceBranchConfirmationPort } from "../../src/adapters/supabase";

const branchId = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const command = {
  actorUserId: "actor",
  organizationId: "organization",
  companyId: "company",
  invoiceId: "purchase-1",
  branchId,
} as never as ConfirmPurchaseInvoiceForBranchCommand;
const rawData = { id: command.invoiceId, company_id: command.companyId, status: "confirmada", branch_id: branchId };
const resultData = { invoiceId: command.invoiceId, companyId: command.companyId, status: "confirmed", branchId };

function port(reply: { readonly data: unknown; readonly error: { readonly message: string } | null }): SupabasePurchaseInvoiceBranchConfirmationPort {
  const client = { async rpc() { return reply; } } as unknown as SupabaseClient;
  return new SupabasePurchaseInvoiceBranchConfirmationPort(client);
}

test("branch-aware purchase confirmation maps the raw protected RPC response to its portable result", async () => {
  const result = await port({ data: rawData, error: null }).confirm(command);

  assert.deepEqual(result, resultData);
  assert.equal(Object.isFrozen(result), true);
});

test("branch-aware purchase confirmation maps access denial and rejects unmatched output", async () => {
  await assert.rejects(
    port({ data: null, error: { message: "PURCHASE_BRANCH_ACCESS_DENIED" } }).confirm(command),
    (error: unknown) => error instanceof PurchaseInvoiceBranchConfirmationFailure && error.code === "PURCHASE_BRANCH_CONFIRMATION_ACCESS_DENIED",
  );
  await assert.rejects(
    port({ data: { ...rawData, branch_id: "6be10ba0-d5d3-4a61-a34f-73d0c81a2346" }, error: null }).confirm(command),
    (error: unknown) => error instanceof PurchaseInvoiceBranchConfirmationFailure && error.code === "PURCHASE_BRANCH_CONFIRMATION_UNAVAILABLE",
  );
  await assert.rejects(
    port({ data: null, error: { message: "PURCHASE_BRANCH_TRANSITION_INVALID" } }).confirm(command),
    (error: unknown) => error instanceof PurchaseInvoiceBranchConfirmationFailure && error.code === "PURCHASE_BRANCH_CONFIRMATION_CONFLICT",
  );
});
