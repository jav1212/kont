import assert from "node:assert/strict";
import test from "node:test";
import { CreateManualPayable, ChangePayableDueDate, type PayablesCommandResult, type PayablesRepository, type PayablesWriteCommand } from "../../src/application";
import { PayablesFailure } from "../../src/domain";

const scope = { tenantId: "tenant", organizationId: "org", companyId: "company", actorId: "actor" };
const receipt: PayablesCommandResult = { commandId: "command", replayed: false, affectedIds: ["document"], versions: { document: 1 } };

function repository(capture: (command: PayablesWriteCommand) => void): PayablesRepository {
  return {
    async execute(_scope, command) { capture(command); return receipt; },
    async list() { return { rows: [], total: 0 }; },
    async report() { return { rows: [], total: 0 }; },
  };
}

test("manual payable validates exact terms and sends a serializable command", async () => {
  let received: PayablesWriteCommand | undefined;
  const result = await new CreateManualPayable(repository((command) => { received = command; })).execute({
    ...scope, idempotencyKey: "create-1", correlationId: "correlation-1", documentId: "document", supplierId: "supplier",
    documentNumber: "INV-1", concept: "Consulting", issuedAt: "2026-10-01", dueAt: "2026-10-30", currency: "USD", principal: "125.50",
    rateSnapshot: { amount: "54321.75", rate: "432.84223108", source: "BCV", effectiveDate: "2026-10-01", policyVersion: "v1" },
  });
  assert.equal(result.commandId, "command");
  assert.equal(received?.kind, "create_manual_document");
  if (received?.kind !== "create_manual_document") throw new Error("Manual command was not emitted.");
  assert.equal(received.principal, "125.50");
  assert.equal(received.rateSnapshot.amount, "54321.75");
});

test("manual payable rejects an invalid date range before persistence", async () => {
  let called = false;
  const useCase = new CreateManualPayable(repository(() => { called = true; }));
  await assert.rejects(() => useCase.execute({
    ...scope, idempotencyKey: "create-2", correlationId: "correlation-2", documentId: "document", supplierId: "supplier",
    documentNumber: "INV-1", concept: "Consulting", issuedAt: "2026-10-30", dueAt: "2026-10-01", currency: "USD", principal: "125.50",
    rateSnapshot: { amount: "54321.75", rate: "432.84223108", source: "BCV", effectiveDate: "2026-10-01", policyVersion: "v1" },
  }), (error: unknown) => error instanceof PayablesFailure && error.code === "INVALID");
  assert.equal(called, false);
});

test("due date update requires a reason and sends the expected version", async () => {
  let received: PayablesWriteCommand | undefined;
  const result = await new ChangePayableDueDate(repository((command) => { received = command; })).execute({
    ...scope, idempotencyKey: "due-1", correlationId: "correlation-1", changeId: "change-1", documentId: "document",
    dueAt: "2026-11-15", reason: "Proveedor extendió plazo", expectedVersion: 3,
  });
  assert.equal(result.commandId, "command");
  assert.equal(received?.kind, "change_due_date");
  if (received?.kind !== "change_due_date") throw new Error("Due date command was not emitted.");
  assert.equal(received.expectedVersion, 3);
});
