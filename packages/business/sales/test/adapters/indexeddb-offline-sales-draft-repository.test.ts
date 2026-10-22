import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { IndexedDbOfflineSalesDraftRepository } from "../../src/adapters/offline";
import { claimOfflineSalesDraft, newOfflineSalesDraft, type OfflineSalesDraft } from "../../src/domain";

const actor = userId("7b12e42d-3945-4d34-a035-feb773b50001");
const operationA = "33333333-3333-4333-8333-333333333333";
const operationB = "44444444-4444-4444-8444-444444444444";
const queuedAt = "2026-09-28T12:00:00.000Z";
let databaseSequence = 0;

function makeDraft(operationId: string, note: string, queuedAtValue = queuedAt): OfflineSalesDraft {
  return newOfflineSalesDraft({
    operationId,
    actorUserId: actor,
    organizationId: organizationId("8e2403ad-a266-4ffc-8680-b744f241001e"),
    companyId: companyId("J-12345678-9"),
    branchId: "6be10ba0-d5d3-4a61-a34f-73d0c81a2345",
    queuedAt: queuedAtValue,
    sealedPayload: { ciphertext: `ciphertext-${note}`, intentTag: `intent-${note}`, keyVersion: "55555555-5555-4555-8555-555555555555" },
  });
}

function repository(): IndexedDbOfflineSalesDraftRepository {
  databaseSequence += 1;
  return new IndexedDbOfflineSalesDraftRepository(indexedDB, `sales-offline-adapter-test-${databaseSequence}`);
}

test("IndexedDB enqueue is durable and concurrent retries preserve the first ciphertext", async () => {
  const firstRepository = repository();
  const candidate = makeDraft(operationA, "same");
  const results = await Promise.all([firstRepository.enqueue(candidate), firstRepository.enqueue(candidate)]);
  assert.deepEqual(results.map((result) => result.created).sort(), [false, true]);
  await firstRepository.close();

  const reopenedRepository = new IndexedDbOfflineSalesDraftRepository(indexedDB, `sales-offline-adapter-test-${databaseSequence}`);
  const claim = await reopenedRepository.claimNext({ actorUserId: actor, leaseId: "00000000-0000-4000-8000-000000000001", now: queuedAt, leaseExpiresAt: "2026-09-28T12:02:00.000Z" });
  assert.equal(claim?.operationId, operationA);
  assert.equal(claim?.sealedPayload.ciphertext, "ciphertext-same");
  await reopenedRepository.close();
});

test("IndexedDB rejects reuse of an operation ID with changed intent or scope", async () => {
  const outbox = repository();
  await outbox.enqueue(makeDraft(operationA, "original"));
  await assert.rejects(() => outbox.enqueue(makeDraft(operationA, "changed")), { code: "SALES_OFFLINE_DRAFT_IDEMPOTENCY_CONFLICT" });
  await outbox.close();
});

test("IndexedDB atomically claims distinct drafts in FIFO order under competing synchronizers", async () => {
  const outbox = repository();
  await outbox.enqueue(makeDraft(operationA, "older", "2026-09-28T12:00:00.000Z"));
  await outbox.enqueue(makeDraft(operationB, "newer", "2026-09-28T12:01:00.000Z"));
  const claims = await Promise.all([
    outbox.claimNext({ actorUserId: actor, leaseId: "00000000-0000-4000-8000-000000000001", now: queuedAt, leaseExpiresAt: "2026-09-28T12:02:00.000Z" }),
    outbox.claimNext({ actorUserId: actor, leaseId: "00000000-0000-4000-8000-000000000002", now: queuedAt, leaseExpiresAt: "2026-09-28T12:02:00.000Z" }),
  ]);
  assert.deepEqual(claims.map((claim) => claim?.operationId), [operationA, operationB]);
  assert.equal(new Set(claims.map((claim) => claim?.leaseId)).size, 2);
  await outbox.close();
});

test("IndexedDB reclaims expired leases and rejects stale settlement revisions", async () => {
  const outbox = repository();
  const initial = makeDraft(operationA, "lease");
  const firstClaim = claimOfflineSalesDraft(initial, "00000000-0000-4000-8000-000000000001", queuedAt, "2026-09-28T12:02:00.000Z");
  await outbox.enqueue(firstClaim);
  const replacement = await outbox.claimNext({ actorUserId: actor, leaseId: "00000000-0000-4000-8000-000000000002", now: "2026-09-28T12:02:00.000Z", leaseExpiresAt: "2026-09-28T12:04:00.000Z" });
  assert.equal(replacement?.leaseId, "00000000-0000-4000-8000-000000000002");
  await assert.rejects(() => outbox.settle({ operationId: operationA, expectedRevision: firstClaim.revision, leaseId: firstClaim.leaseId!, result: { kind: "retry" } }),
    { code: "SALES_OFFLINE_DRAFT_LEASE_CONFLICT" });
  const settled = await outbox.settle({ operationId: operationA, expectedRevision: replacement!.revision, leaseId: replacement!.leaseId!, result: { kind: "synced", serverDraftId: "server-draft-1" } });
  assert.equal(settled.status, "synced");
  await outbox.close();
});
