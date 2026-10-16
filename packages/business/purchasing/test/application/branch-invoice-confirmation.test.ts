import assert from "node:assert/strict";
import test from "node:test";
import {
  ConfirmPurchaseInvoiceForBranch,
  PurchaseInvoiceBranchConfirmationFailure,
  type ConfirmPurchaseInvoiceForBranchCommand,
  type PurchaseInvoiceBranchConfirmationPort,
} from "../../src/application";

const branchId = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const command = {
  actorUserId: "actor",
  organizationId: "organization",
  companyId: "company",
  invoiceId: " purchase-1 ",
  branchId: branchId.toUpperCase(),
} as never as ConfirmPurchaseInvoiceForBranchCommand;

test("branch-aware purchase confirmation normalizes only valid invoice and branch identifiers", async () => {
  let received: ConfirmPurchaseInvoiceForBranchCommand | undefined;
  const port: PurchaseInvoiceBranchConfirmationPort = {
    async confirm(value) {
      received = value;
      return { invoiceId: value.invoiceId, companyId: value.companyId, status: "confirmed", branchId: value.branchId };
    },
  };

  await new ConfirmPurchaseInvoiceForBranch(port).execute(command);

  assert.equal(received?.invoiceId, "purchase-1");
  assert.equal(received?.branchId, branchId);
  assert.equal(Object.isFrozen(received), true);
});

test("branch-aware purchase confirmation rejects malformed branch and invoice identity", async () => {
  const port: PurchaseInvoiceBranchConfirmationPort = { async confirm() { throw new Error("must not be called"); } };
  const useCase = new ConfirmPurchaseInvoiceForBranch(port);

  await assert.rejects(useCase.execute({ ...command, branchId: "HQ" }), invalid);
  await assert.rejects(useCase.execute({ ...command, invoiceId: " " }), invalid);
});

test("branch-aware purchase confirmation preserves typed conflict failures", async () => {
  const port: PurchaseInvoiceBranchConfirmationPort = {
    async confirm() { throw new PurchaseInvoiceBranchConfirmationFailure("PURCHASE_BRANCH_CONFIRMATION_CONFLICT", "already confirmed"); },
  };

  await assert.rejects(new ConfirmPurchaseInvoiceForBranch(port).execute(command), (error: unknown) =>
    error instanceof PurchaseInvoiceBranchConfirmationFailure && error.code === "PURCHASE_BRANCH_CONFIRMATION_CONFLICT");
});

function invalid(error: unknown): boolean {
  return error instanceof PurchaseInvoiceBranchConfirmationFailure && error.code === "PURCHASE_BRANCH_CONFIRMATION_INVALID";
}
