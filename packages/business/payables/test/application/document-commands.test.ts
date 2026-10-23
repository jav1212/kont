import assert from "node:assert/strict";
import test from "node:test";
import { createExecutePayablesCommand, type PayablesValuationPort, type PayablesWriteCommand } from "../../src/application";
import { PayablesFailure } from "../../src/domain";
import { createPayablesRepositoryStub } from "../../src/testing";

const scope = { tenantId: "tenant", organizationId: "org", companyId: "company", actorId: "actor" };
const clientSnapshot = { amount: "1", baseCurrency: "VES" as const, rate: "1", source: "client", effectiveDate: "2026-10-01", policyVersion: "client", rounding: "half_up" as const };
const serverSnapshot = { amount: "4328.42", baseCurrency: "VES" as const, rate: "43.2842", source: "bcv:official", effectiveDate: "2026-10-05", policyVersion: "3", rounding: "half_up" as const };

function capture(): { readonly sent: PayablesWriteCommand[]; readonly execute: ReturnType<typeof createExecutePayablesCommand> } {
  const sent: PayablesWriteCommand[] = [];
  const repository = createPayablesRepositoryStub({ async execute(_scope, command) { sent.push(command); return { commandId: "ok", replayed: false, affectedIds: [], versions: {} }; } });
  const valuation: PayablesValuationPort = { async value(input) { assert.equal(input.asOf, "2026-10-05"); assert.equal(input.amount, "100.00"); return serverSnapshot; } };
  return { sent, execute: createExecutePayablesCommand(repository, valuation) };
}

const adjustment = {
  ...scope,
  kind: "create_adjustment" as const, idempotencyKey: "adj", correlationId: "c", documentId: "adj-1", supplierId: "s", documentNumber: "AJ-1",
  concept: "Descuento", reason: "Acuerdo", direction: "negative" as const, issuedAt: "2026-10-05", currency: "USD", principal: "100.00", rateSnapshot: clientSnapshot,
};

test("document-creating commands persist the server valuation, never the client snapshot", async () => {
  const { sent, execute } = capture();
  await execute.execute(scope, adjustment);
  const command = sent[0];
  if (command?.kind !== "create_adjustment") throw new Error("Adjustment was not sent.");
  assert.deepEqual(command.rateSnapshot, serverSnapshot);
});

test("document creation is unavailable without a configured valuation", async () => {
  const execute = createExecutePayablesCommand(createPayablesRepositoryStub());
  await assert.rejects(() => execute.execute(scope, adjustment), (error: unknown) => error instanceof PayablesFailure && error.code === "UNAVAILABLE");
});

test("positive adjustments and opening balances require their own facts", async () => {
  const { sent, execute } = capture();
  await assert.rejects(() => execute.execute(scope, { ...scope, ...adjustment, direction: "positive" }), (error: unknown) => error instanceof PayablesFailure && error.code === "INVALID");
  await assert.rejects(() => execute.execute(scope, { ...scope, ...adjustment, kind: "import_opening_document", dueAt: "2026-10-05", evidence: " " }), (error: unknown) => error instanceof PayablesFailure && error.code === "INVALID");
  assert.equal(sent.length, 0);
});

test("credit applications reject repeated documents and inexact amounts before persistence", async () => {
  const { sent, execute } = capture();
  const base = { kind: "apply_credit" as const, idempotencyKey: "apply", correlationId: "c", creditDocumentId: "credit", occurredAt: "2026-10-06" };
  await assert.rejects(() => execute.execute(scope, { ...scope, ...base, allocations: [{ applicationId: "a1", documentId: "d1", amount: "1.00" }, { applicationId: "a2", documentId: "d1", amount: "2.00" }] }), PayablesFailure);
  await assert.rejects(() => execute.execute(scope, { ...scope, ...base, allocations: [{ applicationId: "a1", documentId: "d1", amount: "1.005" }] }), PayablesFailure);
  await execute.execute(scope, { ...scope, ...base, allocations: [{ applicationId: "a1", documentId: "d1", amount: "1.50" }] });
  assert.equal(sent.length, 1);
});

test("installment plans and their undo carry expected versions", async () => {
  const { sent, execute } = capture();
  await assert.rejects(() => execute.execute(scope, { ...scope, kind: "create_installment_plan", idempotencyKey: "p", correlationId: "c", planId: "p1", documentId: "d1", expectedVersion: 2, installments: [{ documentId: "g1", amount: "10.00", dueAt: "2026-11-01" }] }), PayablesFailure);
  await execute.execute(scope, { ...scope, kind: "create_installment_plan", idempotencyKey: "p", correlationId: "c", planId: "p1", documentId: "d1", expectedVersion: 2, installments: [{ documentId: "g1", amount: "10.00", dueAt: "2026-11-01" }, { documentId: "g2", amount: "10.01", dueAt: "2026-12-01" }] });
  await assert.rejects(() => execute.execute(scope, { ...scope, kind: "undo_installment_plan", idempotencyKey: "u", correlationId: "c", planId: "p1", expectedVersion: 0, reason: "x" }), PayablesFailure);
  assert.equal(sent.length, 1);
});
