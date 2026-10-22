import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import {
  IndexedDbOfflineDraftCryptoKeyStore,
  WebCryptoOfflineDraftPayloadProtector,
  type OfflineDraftWebCryptoRuntime,
} from "../../src/adapters/offline";
import type { OfflineDraftPayloadBinding } from "../../src/application/offline-sales-drafts";

const actor = userId("7b12e42d-3945-4d34-a035-feb773b50001");
const otherActor = userId("11111111-1111-4111-8111-111111111111");
const binding: OfflineDraftPayloadBinding = {
  operationId: "33333333-3333-4333-8333-333333333333",
  actorUserId: actor,
  organizationId: organizationId("8e2403ad-a266-4ffc-8680-b744f241001e"),
  companyId: companyId("J-12345678-9"),
  branchId: "6be10ba0-d5d3-4a61-a34f-73d0c81a2345",
};
const runtime = webcrypto as unknown as OfflineDraftWebCryptoRuntime;
let databaseSequence = 0;

function store(databaseName: string) {
  return new IndexedDbOfflineDraftCryptoKeyStore(indexedDB, runtime, databaseName);
}

test("IndexedDB key store atomically provisions actor-specific non-exportable keys across tabs", async () => {
  databaseSequence += 1;
  const name = `sales-offline-key-test-${databaseSequence}`;
  const first = store(name);
  const second = store(name);
  const [keysetA, keysetB] = await Promise.all([first.getOrCreate(actor), second.getOrCreate(actor)]);
  assert.equal(keysetA.keyVersion, keysetB.keyVersion);
  assert.equal(keysetA.encryptionKey.extractable, false);
  assert.equal(keysetA.deduplicationKey.extractable, false);
  assert.notEqual((await first.getOrCreate(otherActor)).keyVersion, keysetA.keyVersion);
  await first.close();
  await second.close();
});

test("WebCrypto resumes decrypting queued payload after the browser key store is reopened", async () => {
  databaseSequence += 1;
  const name = `sales-offline-key-test-${databaseSequence}`;
  const firstStore = store(name);
  const firstProtector = new WebCryptoOfflineDraftPayloadProtector(firstStore, runtime);
  const plaintext = JSON.stringify({ customerId: "customer-1", amount: "125.50" });
  const sealed = await firstProtector.seal(binding, plaintext);
  await firstStore.close();

  const reopenedStore = store(name);
  const reopenedProtector = new WebCryptoOfflineDraftPayloadProtector(reopenedStore, runtime);
  assert.equal(await reopenedProtector.open(binding, sealed), plaintext);
  await reopenedStore.close();
});
