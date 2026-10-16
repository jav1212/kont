import type { UserId } from "@kontave/organizations/domain";
import type { OfflineDraftPayloadBinding, OfflineDraftPayloadProtector } from "../../application/offline-sales-drafts";
import { SalesFailure, type SealedOfflineDraftPayload } from "../../domain";

/**
 * Non-exportable keys supplied by a platform-owned OS/browser key store.
 * `deduplicationKey` must remain stable for the lifetime of queued operations,
 * including while encryption keys rotate, so replay keeps the same intent tag.
 */
export interface OfflineDraftCryptoKeyset {
  readonly userId: UserId;
  readonly keyVersion: string;
  readonly encryptionKey: CryptoKey;
  readonly deduplicationKey: CryptoKey;
}

/** Device-bound key lifecycle boundary; key material never leaves its platform adapter. */
export interface OfflineDraftCryptoKeyStore {
  /** Loads or atomically creates non-exportable AES-GCM and HMAC-SHA-256 keys for one user. @param userId - Authenticated owner of the local keyset. @returns Persisted keyset with a stable version identifier. @throws {SalesFailure} When secure local key persistence is unavailable. */
  getOrCreate(userId: UserId): Promise<OfflineDraftCryptoKeyset>;
  /** Loads an existing key version without silently replacing a missing key. @param userId - Expected owner of the keyset. @param keyVersion - Version recorded with the encrypted outbox entry. @returns The matching keyset, or `null` when it was removed. @throws {SalesFailure} When secure local key storage cannot be read. */
  find(userId: UserId, keyVersion: string): Promise<OfflineDraftCryptoKeyset | null>;
}

/** Minimal Web Crypto runtime, injectable for deterministic platform tests. */
export interface OfflineDraftWebCryptoRuntime {
  readonly subtle: SubtleCrypto;
  /** Fills the provided view with cryptographically secure random bytes. @param array - Mutable byte view. @returns The same view after filling. @throws {SalesFailure} When secure randomness is unavailable. */
  getRandomValues<T extends ArrayBufferView>(array: T): T;
}

/** AES-GCM payload protection and keyed idempotency tags for offline sales drafts. */
export class WebCryptoOfflineDraftPayloadProtector implements OfflineDraftPayloadProtector {
  /** @param keys - Device-bound non-exportable key store. @param runtime - Web Crypto implementation for the current client. @returns Payload protector. */
  constructor(private readonly keys: OfflineDraftCryptoKeyStore, private readonly runtime: OfflineDraftWebCryptoRuntime) {}

  /** {@inheritDoc OfflineDraftPayloadProtector.seal} */
  async seal(binding: OfflineDraftPayloadBinding, plaintext: string): Promise<SealedOfflineDraftPayload> {
    try {
      const keyset = await this.keys.getOrCreate(binding.actorUserId);
      assertKeyset(keyset, binding.actorUserId);
      const iv = this.runtime.getRandomValues(new Uint8Array(12));
      const additionalData = encodeBinding(binding);
      const clear = new TextEncoder().encode(plaintext);
      const [ciphertext, intentTag] = await Promise.all([
        this.runtime.subtle.encrypt({ name: "AES-GCM", iv, additionalData, tagLength: 128 }, keyset.encryptionKey, clear),
        this.runtime.subtle.sign("HMAC", keyset.deduplicationKey, tagInput(additionalData, clear)),
      ]);
      return Object.freeze({ ciphertext: toHex(concat(iv, new Uint8Array(ciphertext))), intentTag: toHex(new Uint8Array(intentTag)), keyVersion: keyset.keyVersion });
    } catch (cause: unknown) {
      if (cause instanceof SalesFailure) throw cause;
      throw new SalesFailure("SALES_OFFLINE_DRAFT_PAYLOAD_UNAVAILABLE", "Could not encrypt the offline sales draft payload.", { cause });
    }
  }

  /** {@inheritDoc OfflineDraftPayloadProtector.open} */
  async open(binding: OfflineDraftPayloadBinding, sealed: SealedOfflineDraftPayload): Promise<string> {
    try {
      const keyset = await this.keys.find(binding.actorUserId, sealed.keyVersion);
      if (!keyset) throw new Error("The recorded offline draft key version is unavailable.");
      assertKeyset(keyset, binding.actorUserId);
      const packed = fromHex(sealed.ciphertext);
      if (packed.length < 28) throw new Error("The encrypted payload is truncated.");
      const iv = packed.slice(0, 12);
      const ciphertext = packed.slice(12);
      const additionalData = encodeBinding(binding);
      const clearBuffer = await this.runtime.subtle.decrypt({ name: "AES-GCM", iv, additionalData, tagLength: 128 }, keyset.encryptionKey, ciphertext);
      const clear = new Uint8Array(clearBuffer);
      const validTag = await this.runtime.subtle.verify("HMAC", keyset.deduplicationKey, fromHex(sealed.intentTag), tagInput(additionalData, clear));
      if (!validTag) throw new Error("Offline draft intent tag did not verify.");
      return new TextDecoder("utf-8", { fatal: true }).decode(clear);
    } catch (cause: unknown) {
      throw new SalesFailure("SALES_OFFLINE_DRAFT_PAYLOAD_UNAVAILABLE", "Could not authenticate or decrypt the offline sales draft payload.", { cause });
    }
  }
}

function assertKeyset(keyset: OfflineDraftCryptoKeyset, expectedUserId: UserId): void {
  const encryption = keyset.encryptionKey;
  const deduplication = keyset.deduplicationKey;
  const encryptionAlgorithm = encryption.algorithm as AesKeyAlgorithm;
  const deduplicationAlgorithm = deduplication.algorithm as HmacKeyAlgorithm;
  if (keyset.userId !== expectedUserId || !isUuid(keyset.keyVersion)
    || encryption.extractable || encryption.algorithm.name !== "AES-GCM"
    || encryptionAlgorithm.length !== 256
    || !encryption.usages.includes("encrypt") || !encryption.usages.includes("decrypt")
    || deduplication.extractable || deduplication.algorithm.name !== "HMAC"
    || deduplicationAlgorithm.hash.name !== "SHA-256"
    || !deduplication.usages.includes("sign") || !deduplication.usages.includes("verify")) {
    throw new SalesFailure("SALES_OFFLINE_DRAFT_PAYLOAD_UNAVAILABLE", "Offline draft key material is invalid or exportable.");
  }
}

function encodeBinding(binding: OfflineDraftPayloadBinding): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify([
    "kontave.offline-sales-draft.v1", binding.operationId, binding.actorUserId,
    binding.organizationId, binding.companyId, binding.branchId,
  ]));
}

function tagInput(additionalData: Uint8Array<ArrayBuffer>, clear: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  return concat(additionalData, new Uint8Array([0]), clear);
}

function concat(...parts: readonly Uint8Array<ArrayBufferLike>[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function toHex(value: Uint8Array<ArrayBufferLike>): string {
  let result = "";
  for (const byte of value) result += byte.toString(16).padStart(2, "0");
  return result;
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) throw new Error("Encrypted payload is not valid hexadecimal data.");
  const result = new Uint8Array(value.length / 2);
  for (let index = 0; index < result.length; index += 1) result[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return result;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
