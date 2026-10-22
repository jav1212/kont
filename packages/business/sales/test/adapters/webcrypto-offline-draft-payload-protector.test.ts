import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import type { OfflineDraftPayloadBinding } from "../../src/application/offline-sales-drafts";
import { SalesFailure } from "../../src/domain";
import {
  WebCryptoOfflineDraftPayloadProtector,
  type OfflineDraftCryptoKeyStore,
  type OfflineDraftCryptoKeyset,
  type OfflineDraftWebCryptoRuntime,
} from "../../src/adapters/offline";

const actor = userId("7b12e42d-3945-4d34-a035-feb773b50001");
const binding: OfflineDraftPayloadBinding = {
  operationId: "33333333-3333-4333-8333-333333333333",
  actorUserId: actor,
  organizationId: organizationId("8e2403ad-a266-4ffc-8680-b744f241001e"),
  companyId: companyId("J-12345678-9"),
  branchId: "6be10ba0-d5d3-4a61-a34f-73d0c81a2345",
};
const runtime = webcrypto as unknown as OfflineDraftWebCryptoRuntime;

class MemoryCryptoKeyStore implements OfflineDraftCryptoKeyStore {
  keyset: OfflineDraftCryptoKeyset | null = null;
  async getOrCreate(userIdValue: typeof actor): Promise<OfflineDraftCryptoKeyset> {
    if (!this.keyset) {
      const encryptionKey = await webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      const deduplicationKey = await webcrypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign", "verify"]);
      this.keyset = { userId: userIdValue, keyVersion: "55555555-5555-4555-8555-555555555555", encryptionKey, deduplicationKey };
    }
    return this.keyset;
  }
  async find(userIdValue: typeof actor, keyVersion: string): Promise<OfflineDraftCryptoKeyset | null> {
    return this.keyset?.userId === userIdValue && this.keyset.keyVersion === keyVersion ? this.keyset : null;
  }
}

function protector(keys: OfflineDraftCryptoKeyStore = new MemoryCryptoKeyStore()) {
  return new WebCryptoOfflineDraftPayloadProtector(keys, runtime);
}

test("WebCrypto seals offline draft payloads with authenticated scope and stable keyed intent tags", async () => {
  const subject = protector();
  const cleartext = JSON.stringify({ customer: "Sensitive customer", amount: "125.50" });
  const first = await subject.seal(binding, cleartext);
  const second = await subject.seal(binding, cleartext);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(first.intentTag, second.intentTag);
  assert.equal(JSON.stringify(first).includes("Sensitive customer"), false);
  assert.equal(await subject.open(binding, first), cleartext);
});

test("WebCrypto rejects ciphertext moved to another operation, branch, or company", async () => {
  const subject = protector();
  const sealed = await subject.seal(binding, "draft intent");
  await assert.rejects(() => subject.open({ ...binding, branchId: "de3471c8-d0a2-4f0d-8e69-889319032ff0" }, sealed),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_OFFLINE_DRAFT_PAYLOAD_UNAVAILABLE");
  await assert.rejects(() => subject.open({ ...binding, companyId: companyId("J-87654321-0") }, sealed),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_OFFLINE_DRAFT_PAYLOAD_UNAVAILABLE");
  await assert.rejects(() => subject.open({ ...binding, operationId: "44444444-4444-4444-8444-444444444444" }, sealed),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_OFFLINE_DRAFT_PAYLOAD_UNAVAILABLE");
});

test("WebCrypto rejects tampered ciphertext, keyed tags, and missing key versions", async () => {
  const keys = new MemoryCryptoKeyStore();
  const subject = protector(keys);
  const sealed = await subject.seal(binding, "draft intent");
  const tamperedCiphertext = `${sealed.ciphertext.slice(0, -2)}00`;
  await assert.rejects(() => subject.open(binding, { ...sealed, ciphertext: tamperedCiphertext }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_OFFLINE_DRAFT_PAYLOAD_UNAVAILABLE");
  await assert.rejects(() => subject.open(binding, { ...sealed, intentTag: `${sealed.intentTag.slice(0, -2)}00` }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_OFFLINE_DRAFT_PAYLOAD_UNAVAILABLE");
  await assert.rejects(() => subject.open(binding, { ...sealed, keyVersion: "66666666-6666-4666-8666-666666666666" }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_OFFLINE_DRAFT_PAYLOAD_UNAVAILABLE");
});

test("WebCrypto refuses exportable platform keys", async () => {
  const badKeys: OfflineDraftCryptoKeyStore = {
    async getOrCreate(userIdValue) {
      const encryptionKey = await webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      const deduplicationKey = await webcrypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign", "verify"]);
      return { userId: userIdValue, keyVersion: "55555555-5555-4555-8555-555555555555", encryptionKey, deduplicationKey };
    },
    async find(): Promise<OfflineDraftCryptoKeyset | null> { return null; },
  };
  await assert.rejects(() => protector(badKeys).seal(binding, "draft intent"),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_OFFLINE_DRAFT_PAYLOAD_UNAVAILABLE");
});
