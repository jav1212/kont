import assert from "node:assert/strict";
import test from "node:test";
import { ExecuteTreasuryCommand, RecordCheckDeliveriesBatch, TreasuryFailure, type RecordCheckDeliveryCommand } from "../../src";

const base = { tenantId: "tenant", organizationId: "organization", companyId: "company", actorId: "actor" };
function delivery(index: number): RecordCheckDeliveryCommand {
  return { ...base, idempotencyKey: `delivery-key-${index}`, correlationId: `delivery-correlation-${index}`, kind: "record_check_delivery", deliveryEventId: `delivery-${index}`, checkId: `check-${index}`, recipientName: "Recipient", deliveredAt: "2026-10-01T12:00:00Z", expectedVersion: 1 };
}

test("TES-020 batch records independent outcomes and continues after one stale check", async () => {
  const attempted: string[] = [];
  const execute = new ExecuteTreasuryCommand({ async execute(scope, command) {
    assert.equal(scope.companyId, base.companyId);
    assert.equal(command.kind, "record_check_delivery");
    attempted.push(command.checkId);
    if (command.checkId === "check-2") throw new TreasuryFailure("CONFLICT", "Check version changed.");
    return { commandId: command.deliveryEventId, replayed: false, affectedIds: [command.deliveryEventId], versions: { [command.checkId]: 2 } };
  } });
  const outcomes = await new RecordCheckDeliveriesBatch(execute).execute([delivery(1), delivery(2), delivery(3)]);
  assert.deepEqual(attempted, ["check-1", "check-2", "check-3"]);
  assert.deepEqual(outcomes.map(item => item.status), ["recorded", "failed", "recorded"]);
  assert.equal(outcomes[1]?.status === "failed" ? outcomes[1].errorCode : undefined, "CONFLICT");
});

test("TES-020 batch rejects duplicate checks and mixed authorization scopes before executing", async () => {
  let calls = 0;
  const execute = new ExecuteTreasuryCommand({ async execute() { calls += 1; return { commandId: "ok", replayed: false, affectedIds: [], versions: {} }; } });
  const batch = new RecordCheckDeliveriesBatch(execute);
  await assert.rejects(() => batch.execute([delivery(1), { ...delivery(2), checkId: "check-1" }]), TreasuryFailure);
  await assert.rejects(() => batch.execute([delivery(1), { ...delivery(2), companyId: "other-company" }]), TreasuryFailure);
  assert.equal(calls, 0);
});
