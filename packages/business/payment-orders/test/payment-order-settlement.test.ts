import assert from "node:assert/strict";
import test from "node:test";
import { GetPaymentOrderSettlement, type PaymentOrderExecutionEvidence } from "../src/application";
import type { PaymentOrder } from "../src/domain";

const scope = { actorId: "actor", organizationId: "org", companyId: "company", id: "order" };
const order: PaymentOrder = { id: "order", tenantId: "tenant", organizationId: "org", companyId: "company", beneficiary: "Supplier", concept: "Invoice", amount: "123.45000000", currency: "VES", dueDate: null, status: "draft", version: 1 };
const evidence: PaymentOrderExecutionEvidence = { paymentId: "payment", paymentOrderId: "order", organizationId: "org", companyId: "company", amount: "123.45", currency: "VES", occurredOn: "2026-09-30", ledgerEntryId: "entry" };

test("settlement composes exact execution without treating draft as unpaid", async () => {
  const query = new GetPaymentOrderSettlement({ get: async () => order }, { getExecution: async () => evidence });
  const result = await query.execute(scope);
  assert.equal(result.settlementStatus, "paid");
  assert.equal(result.remainingAmount, "0");
  assert.equal(result.order.status, "draft");
});

test("unpaid and cancelled orders retain distinct meanings", async () => {
  for (const status of ["draft", "cancelled"] as const) {
    const query = new GetPaymentOrderSettlement({ get: async () => ({ ...order, status }) }, { getExecution: async () => null });
    const result = await query.execute(scope);
    assert.equal(result.settlementStatus, status === "draft" ? "unpaid" : "cancelled");
    assert.equal(result.remainingAmount, status === "draft" ? order.amount : "0");
  }
});

test("settlement rejects another company, amount, currency or cancelled executed order", async () => {
  for (const patch of [{ companyId: "other" }, { amount: "123.45000001" }, { currency: "USD" }]) {
    const query = new GetPaymentOrderSettlement({ get: async () => order }, { getExecution: async () => ({ ...evidence, ...patch }) });
    await assert.rejects(query.execute(scope), { code: "CONFLICT" });
  }
  const query = new GetPaymentOrderSettlement({ get: async () => ({ ...order, status: "cancelled" }) }, { getExecution: async () => evidence });
  await assert.rejects(query.execute(scope), { code: "CONFLICT" });
});
