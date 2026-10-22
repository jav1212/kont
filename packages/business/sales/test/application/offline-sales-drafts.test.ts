import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import {
  SalesFailure,
  claimOfflineSalesDraft,
  newOfflineSalesDraft,
  offlineSalesDraft,
  settleOfflineSalesDraft,
  type OfflineSalesDraft,
  type SealedOfflineDraftPayload,
  type OfflineDraftJson,
} from "../../src/domain";
import {
  QueueOfflineSalesDraft,
  SynchronizeOfflineSalesDrafts,
  type OfflineDraftClock,
  type OfflineDraftLeaseIdSource,
  type OfflineDraftPayloadBinding,
  type OfflineDraftPayloadProtector,
  type OfflineSalesDraftGateway,
  type OfflineSalesDraftEnqueueResult,
  type OfflineSalesDraftRepository,
} from "../../src/application/offline-sales-drafts";

const actor = userId("7b12e42d-3945-4d34-a035-feb773b50001");
const organization = organizationId("8e2403ad-a266-4ffc-8680-b744f241001e");
const company = companyId("J-12345678-9");
const branch = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const operationId = "33333333-3333-4333-8333-333333333333";
const secondOperationId = "44444444-4444-4444-8444-444444444444";
const date = "2026-09-28T12:00:00.000Z";

class TestClock implements OfflineDraftClock { value = date; now(): string { return this.value; } }

class TestProtector implements OfflineDraftPayloadProtector {
  readonly plaintext = new Map<string, string>();
  async seal(binding: OfflineDraftPayloadBinding, plaintext: string): Promise<SealedOfflineDraftPayload> {
    const digest = createHash("sha256").update(`${JSON.stringify(binding)}:${plaintext}`).digest("hex");
    this.plaintext.set(`${binding.operationId}:${digest}`, plaintext);
    return { ciphertext: `ciphertext-${digest}`, intentTag: digest, keyVersion: "test-key-1" };
  }
  async open(binding: OfflineDraftPayloadBinding, sealed: SealedOfflineDraftPayload): Promise<string> {
    const key = `${binding.operationId}:${sealed.intentTag}`;
    const value = this.plaintext.get(key);
    if (!value) throw new SalesFailure("SALES_OFFLINE_DRAFT_PAYLOAD_UNAVAILABLE", "Test payload is unavailable.");
    return value;
  }
}

class MemoryOfflineOutbox implements OfflineSalesDraftRepository {
  readonly records = new Map<string, OfflineSalesDraft>();
  async enqueue(operation: OfflineSalesDraft): Promise<OfflineSalesDraftEnqueueResult> {
    const previous = this.records.get(operation.operationId);
    if (previous) {
      if (previous.sealedPayload.intentTag !== operation.sealedPayload.intentTag || previous.branchId !== operation.branchId
        || previous.companyId !== operation.companyId || previous.actorUserId !== operation.actorUserId
        || previous.organizationId !== operation.organizationId) {
        throw new SalesFailure("SALES_OFFLINE_DRAFT_IDEMPOTENCY_CONFLICT", "Operation ID reused for another intent.");
      }
      return { operation: previous, created: false };
    }
    this.records.set(operation.operationId, offlineSalesDraft(operation));
    return { operation, created: true };
  }
  async claimNext(input: Parameters<OfflineSalesDraftRepository["claimNext"]>[0]): Promise<OfflineSalesDraft | null> {
    const candidate = [...this.records.values()].find((record) => record.actorUserId === input.actorUserId
      && (record.status === "pending" || (record.status === "syncing" && record.leaseExpiresAt !== null && Date.parse(record.leaseExpiresAt) <= Date.parse(input.now))));
    if (!candidate) return null;
    const claimed = claimOfflineSalesDraft(candidate, input.leaseId, input.now, input.leaseExpiresAt);
    this.records.set(claimed.operationId, claimed);
    return claimed;
  }
  async settle(input: Parameters<OfflineSalesDraftRepository["settle"]>[0]): Promise<OfflineSalesDraft> {
    const current = this.records.get(input.operationId);
    if (!current || current.revision !== input.expectedRevision) throw new SalesFailure("SALES_OFFLINE_DRAFT_LEASE_CONFLICT", "Stale revision.");
    const updated = settleOfflineSalesDraft(current, input.leaseId, input.result);
    this.records.set(updated.operationId, updated);
    return updated;
  }
}

class TestLeaseIds implements OfflineDraftLeaseIdSource {
  private index = 0;
  next(): string { this.index += 1; return `00000000-0000-4000-8000-${String(this.index).padStart(12, "0")}`; }
}

function binding(id = operationId) { return { operationId: id, actorUserId: actor, organizationId: organization, companyId: company, branchId: branch }; }
function intent(note = "counter sale") { return { customerId: "customer-1", orderDate: "2026-09-28", note, lines: [{ description: "Service", quantity: "1", unitPrice: "25.00" }] } as const; }
async function queueDraft(outbox: MemoryOfflineOutbox, protector: TestProtector, clock: TestClock, id = operationId, payload: OfflineDraftJson = intent()) {
  return new QueueOfflineSalesDraft(outbox, protector, clock).execute({ ...binding(id), payload });
}
function gatewayWith(outcomes: Array<Awaited<ReturnType<OfflineSalesDraftGateway["createDraft"]>>>) {
  const calls: Array<Parameters<OfflineSalesDraftGateway["createDraft"]>[0]> = [];
  const gateway: OfflineSalesDraftGateway = { async createDraft(input) { calls.push(input); return outcomes.shift() ?? { kind: "retry" }; } };
  return { gateway, calls };
}

test("offline queue encrypts a bounded intent and replays an identical operation idempotently", async () => {
  const outbox = new MemoryOfflineOutbox(); const protector = new TestProtector(); const clock = new TestClock();
  const first = await queueDraft(outbox, protector, clock);
  const replay = await queueDraft(outbox, protector, clock);
  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.equal(replay.operation.status, "pending");
  assert.equal(JSON.stringify(replay.operation).includes("counter sale"), false);
  assert.equal(protector.plaintext.size, 1);
  assert.equal(first.operation.branchId, branch);
});

test("offline idempotency rejects a changed draft using the same operation UUID", async () => {
  const outbox = new MemoryOfflineOutbox(); const protector = new TestProtector(); const clock = new TestClock();
  await queueDraft(outbox, protector, clock);
  await assert.rejects(() => queueDraft(outbox, protector, clock, operationId, intent("different intent")),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_OFFLINE_DRAFT_IDEMPOTENCY_CONFLICT");
  assert.equal(outbox.records.size, 1);
});

test("offline queue rejects invalid scope and overlarge JSON before durable insertion", async () => {
  const outbox = new MemoryOfflineOutbox(); const protector = new TestProtector(); const clock = new TestClock();
  const queue = new QueueOfflineSalesDraft(outbox, protector, clock);
  await assert.rejects(() => queue.execute({ ...binding("bad"), payload: intent() }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_OFFLINE_DRAFT_INVALID");
  await assert.rejects(() => queueDraft(outbox, protector, clock, operationId, { body: "x".repeat(65_537) }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_OFFLINE_DRAFT_INVALID");
  assert.equal(outbox.records.size, 0);
});

test("reconnection retries uncertain delivery with the same idempotency key, then records server acceptance", async () => {
  const outbox = new MemoryOfflineOutbox(); const protector = new TestProtector(); const clock = new TestClock();
  await queueDraft(outbox, protector, clock);
  const { gateway, calls } = gatewayWith([{ kind: "retry" }, { kind: "synced", serverDraftId: "server-draft-1" }]);
  const sync = new SynchronizeOfflineSalesDrafts(outbox, protector, gateway, clock, new TestLeaseIds());
  assert.deepEqual(await sync.execute(actor), { synced: 0, blocked: 0, rejected: 0, retried: 1 });
  assert.equal(outbox.records.get(operationId)?.status, "pending");
  assert.deepEqual(await sync.execute(actor), { synced: 1, blocked: 0, rejected: 0, retried: 0 });
  assert.equal(calls[0]?.operationId, operationId);
  assert.equal(calls[1]?.operationId, operationId);
  assert.deepEqual(calls[0]?.payload, intent());
  assert.equal(outbox.records.get(operationId)?.status, "synced");
  assert.equal(outbox.records.get(operationId)?.serverDraftId, "server-draft-1");
});

test("reconnection leaves revoked access blocked and continues independent queued drafts", async () => {
  const outbox = new MemoryOfflineOutbox(); const protector = new TestProtector(); const clock = new TestClock();
  await queueDraft(outbox, protector, clock);
  await queueDraft(outbox, protector, clock, secondOperationId, intent("another draft"));
  const { gateway, calls } = gatewayWith([
    { kind: "blocked", code: "authorization_revoked" },
    { kind: "synced", serverDraftId: "server-draft-2" },
  ]);
  const result = await new SynchronizeOfflineSalesDrafts(outbox, protector, gateway, clock, new TestLeaseIds()).execute(actor);
  assert.deepEqual(result, { synced: 1, blocked: 1, rejected: 0, retried: 0 });
  assert.equal(outbox.records.get(operationId)?.status, "blocked");
  assert.equal(outbox.records.get(operationId)?.failureCode, "authorization_revoked");
  assert.equal(calls.length, 2);
});

test("a lost device key blocks the payload instead of transmitting or dropping it", async () => {
  const outbox = new MemoryOfflineOutbox(); const protector = new TestProtector(); const clock = new TestClock();
  await queueDraft(outbox, protector, clock);
  protector.plaintext.clear();
  let delivered = 0;
  const gateway: OfflineSalesDraftGateway = { async createDraft() { delivered += 1; return { kind: "synced", serverDraftId: "unexpected" }; } };
  const result = await new SynchronizeOfflineSalesDrafts(outbox, protector, gateway, clock, new TestLeaseIds()).execute(actor);
  assert.deepEqual(result, { synced: 0, blocked: 1, rejected: 0, retried: 0 });
  assert.equal(delivered, 0);
  assert.equal(outbox.records.get(operationId)?.failureCode, "payload_unavailable");
});

test("expired leases can be reclaimed but stale workers cannot settle the new claim", async () => {
  const candidate = newOfflineSalesDraft({ ...binding(), queuedAt: date, sealedPayload: { ciphertext: "sealed", intentTag: "tag", keyVersion: "k1" } });
  const first = claimOfflineSalesDraft(candidate, "00000000-0000-4000-8000-000000000001", date, "2026-09-28T12:02:00.000Z");
  const reclaimed = claimOfflineSalesDraft(first, "00000000-0000-4000-8000-000000000002", "2026-09-28T12:02:00.000Z", "2026-09-28T12:02:30.000Z");
  assert.equal(reclaimed.attemptCount, 2);
  assert.throws(() => settleOfflineSalesDraft(reclaimed, first.leaseId!, { kind: "retry" }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_OFFLINE_DRAFT_LEASE_CONFLICT");
});
