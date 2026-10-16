import assert from "node:assert/strict";
import test from "node:test";
import { PostgresPaymentOrderExecutionReader } from "../../../src/adapters/postgres";

const input = { actorId: "actor", organizationId: "organization", companyId: "company", id: "order" };
test("execution reader maps the one Treasury-owned payment settlement", async () => {
  const reader = new PostgresPaymentOrderExecutionReader({ async call(_name, args) { assert.equal((args.p_query as { kind: string }).kind, "get_payment_order_execution"); return { items: [{ paymentId: "payment", paymentOrderId: "order", amount: "10.00", currency: "VES", occurredOn: "2026-01-01", ledgerEntryId: "ledger" }] }; } }, "tenant");
  assert.deepEqual(await reader.getExecution(input), { paymentId: "payment", paymentOrderId: "order", organizationId: "organization", companyId: "company", amount: "10.00", currency: "VES", occurredOn: "2026-01-01", ledgerEntryId: "ledger" });
});
test("execution reader returns null only for an empty authorized result", async () => {
  const reader = new PostgresPaymentOrderExecutionReader({ async call() { return { items: [] }; } }, "tenant");
  assert.equal(await reader.getExecution(input), null);
});
