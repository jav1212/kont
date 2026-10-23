import assert from "node:assert/strict";
import test from "node:test";
import { createExecutePayablesCommand, type ExecuteSupplierPaymentCommand, type PayablesIslrCalculatorPort, type PayablesValuationPort, type PayablesWriteCommand } from "../../src/application";
import { SupabasePayablesRepository } from "../../src/adapters/supabase";
import { PayablesFailure } from "../../src/domain";
import { createPayablesRepositoryStub } from "../../src/testing";

const scope = { tenantId: "tenant", organizationId: "org", companyId: "company", actorId: "actor" };
const rates: Readonly<Record<string, string>> = { VES: "1", USD: "40.5", EUR: "44" };
const valuation: PayablesValuationPort = {
  async value(input) {
    const rate = rates[input.currency];
    if (!rate) throw new PayablesFailure("INVALID", "Unsupported currency.");
    return { amount: input.amount, baseCurrency: "VES", rate, source: input.currency === "VES" ? "VES identity" : "bcv:official", effectiveDate: input.asOf, policyVersion: "7", rounding: "half_up" };
  },
};
const islr: PayablesIslrCalculatorPort = { calculate: (input) => input.conceptCode === "053" ? { rate: "2", subtrahendVes: "0" } : null };
const payment: ExecuteSupplierPaymentCommand = {
  ...scope, kind: "execute_supplier_payment", idempotencyKey: "pay", correlationId: "c", paymentId: "pay-1", supplierId: "s1", method: "transfer", reference: "REF-9",
  account: { kind: "bank_account", id: "acct" }, occurredAt: "2026-10-21", debtCurrencies: ["USD", "VES"],
  money: { amount: "100.00", currency: "VES", operationalValue: { baseCurrency: "VES", amount: "1", rate: "999", source: "client", asOf: "2020-01-01", policyVersion: "x", rounding: "half_up" } },
  lines: [{ lineId: "l1", documentId: "d1", amount: "60.00" }, { lineId: "l2", documentId: "d2", amount: "40.00" }],
  withholdings: [{ id: "w1", documentId: "d1", kind: "islr", conceptCode: "053", taxableBaseVes: "60.00", taxUnitValue: "9", rate: "99" }],
};

function capture(): { readonly sent: PayablesWriteCommand[]; readonly execute: ReturnType<typeof createExecutePayablesCommand> } {
  const sent: PayablesWriteCommand[] = [];
  const repository = createPayablesRepositoryStub({ async execute(_scope, command) { sent.push(command); return { commandId: "ok", replayed: false, affectedIds: [], versions: {} }; } });
  return { sent, execute: createExecutePayablesCommand(repository, valuation, islr) };
}

test("payments persist server-valued money, debt rates and the ISLR tariff from the catalog", async () => {
  const { sent, execute } = capture();
  await execute.execute(scope, payment);
  const command = sent[0];
  if (command?.kind !== "execute_supplier_payment") throw new Error("Payment was not sent.");
  assert.equal(command.money.operationalValue.rate, "1");
  assert.equal(command.money.operationalValue.asOf, "2026-10-21");
  assert.deepEqual(command.rates, { USD: { rate: "40.5", source: "bcv:official" } });
  assert.deepEqual(command.withholdings?.[0], { id: "w1", documentId: "d1", kind: "islr", conceptCode: "053", taxableBaseVes: "60.00", taxUnitValue: "9", rate: "2", subtrahendVes: "0" }, "the client rate is replaced by the catalog");
});

test("payments reject inexact totals, wrong accounts and missing references before persistence", async () => {
  const { sent, execute } = capture();
  await assert.rejects(() => execute.execute(scope, { ...payment, money: { ...payment.money, amount: "100.01" } }), PayablesFailure);
  await assert.rejects(() => execute.execute(scope, { ...payment, method: "cash" }), PayablesFailure);
  await assert.rejects(() => execute.execute(scope, { ...payment, reference: " " }), PayablesFailure);
  await assert.rejects(() => execute.execute(scope, { ...payment, withholdings: [{ id: "w", documentId: "d1", kind: "vat", rate: "50" }] }), PayablesFailure);
  await assert.rejects(() => execute.execute(scope, { ...payment, withholdings: [{ id: "w", documentId: "d1", kind: "islr", conceptCode: "999", taxableBaseVes: "60", taxUnitValue: "9" }] }), PayablesFailure, "no withholding when the law requires none");
  assert.equal(sent.length, 0);
});

test("payments are unavailable without server valuation", async () => {
  const execute = createExecutePayablesCommand(createPayablesRepositoryStub());
  await assert.rejects(() => execute.execute(scope, payment), (error: unknown) => error instanceof PayablesFailure && error.code === "UNAVAILABLE");
});

test("each command family is sent to its own SQL boundary and treasury rejections are typed", async () => {
  const calls: string[] = [];
  const repository = new SupabasePayablesRepository({
    rpc(name) { calls.push(name); return Promise.resolve(name === "shared_payables_accounting_command" ? { data: null, error: { message: "TREASURY_INSUFFICIENT_FUNDS" } } : { data: { commandId: "c", affectedIds: [] }, error: null }); },
  });
  await repository.execute(scope, { ...scope, kind: "void_supplier_payment", idempotencyKey: "v", correlationId: "c", paymentId: "p", expectedVersion: 1, reason: "x" });
  await repository.execute(scope, { ...scope, kind: "authorize_payment_batch", idempotencyKey: "a", correlationId: "c", batchId: "b", expectedVersion: 2, decision: "authorized", separationRequired: false });
  await repository.execute(scope, { ...scope, kind: "create_adjustment", idempotencyKey: "j", correlationId: "c", documentId: "d", supplierId: "s", documentNumber: "", concept: "x", reason: "y", direction: "negative", issuedAt: "2026-10-01", currency: "VES", principal: "1", rateSnapshot: { amount: "1", baseCurrency: "VES", rate: "1", source: "s", effectiveDate: "2026-10-01", policyVersion: "1", rounding: "half_up" } });
  await assert.rejects(() => repository.execute(scope, { ...scope, kind: "post_payment_accounting", idempotencyKey: "p", correlationId: "c", paymentId: "p" }), (error: unknown) => error instanceof PayablesFailure && error.code === "TREASURY_REJECTED" && error.message === "TREASURY_INSUFFICIENT_FUNDS");
  assert.deepEqual(calls, ["shared_payables_payment_command", "shared_payables_batch_command", "shared_payables_execute_command", "shared_payables_accounting_command"]);
});
