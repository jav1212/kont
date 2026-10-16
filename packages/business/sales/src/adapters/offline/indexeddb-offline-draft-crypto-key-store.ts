import type { UserId } from "@kontave/organizations/domain";
import { SalesFailure } from "../../domain";
import type { OfflineDraftCryptoKeyset, OfflineDraftCryptoKeyStore, OfflineDraftWebCryptoRuntime } from "./webcrypto-offline-draft-payload-protector";

const databaseVersion = 1;
const keysetsStoreName = "keysets";
const activeStoreName = "active-keysets";

interface ActiveKeysetRecord { readonly userId: UserId; readonly keyVersion: string; }

/** Browser-profile key vault storing non-exportable CryptoKeys by structured cloning. */
export class IndexedDbOfflineDraftCryptoKeyStore implements OfflineDraftCryptoKeyStore {
  private databasePromise: Promise<IDBDatabase> | undefined;

  /**
   * @param factory - IndexedDB factory for the same protected browser profile as the outbox.
   * @param runtime - Web Crypto provider used only to create non-exportable device keys.
   * @param databaseName - Isolated key database name.
   * @returns Persistent key store that recovers keys after application restarts.
   * @throws {SalesFailure} When IndexedDB or secure Web Crypto is unavailable.
   */
  constructor(
    private readonly factory: IDBFactory,
    private readonly runtime: OfflineDraftWebCryptoRuntime,
    private readonly databaseName = "kontave-offline-sales-keys",
  ) {
    if (!databaseName.trim() || databaseName.length > 128) throw unavailable();
  }

  /**
   * Loads the actor's active keyset or atomically creates one across tabs.
   * @param userId - Authenticated actor owning this device-local keyset.
   * @returns Non-exportable AES-GCM/HMAC keys and their stable version.
   * @throws {SalesFailure} When key creation, structured cloning, or persistence fails.
   */
  async getOrCreate(userId: UserId): Promise<OfflineDraftCryptoKeyset> {
    const db = await this.database();
    const existing = await this.readActive(db, userId);
    if (existing) return existing;
    const generated = await this.generate(userId);
    return new Promise<OfflineDraftCryptoKeyset>((resolve, reject) => {
      let result: OfflineDraftCryptoKeyset | undefined;
      const transaction = db.transaction([activeStoreName, keysetsStoreName], "readwrite");
      const activeStore = transaction.objectStore(activeStoreName);
      const activeRequest = activeStore.get(userId);
      activeRequest.onsuccess = () => {
        if (activeRequest.result) {
          const active = activeRequest.result as ActiveKeysetRecord;
          const keyRequest = transaction.objectStore(keysetsStoreName).get([userId, active.keyVersion]);
          keyRequest.onsuccess = () => {
            if (keyRequest.result) result = keyRequest.result as OfflineDraftCryptoKeyset;
            else transaction.abort();
          };
          keyRequest.onerror = () => transaction.abort();
        } else {
          try {
            transaction.objectStore(keysetsStoreName).add(generated);
            activeStore.add({ userId, keyVersion: generated.keyVersion } satisfies ActiveKeysetRecord);
            result = generated;
          } catch {
            transaction.abort();
          }
        }
      };
      activeRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => result ? resolve(result) : reject(unavailable());
      transaction.onerror = () => reject(unavailable(transaction.error));
      transaction.onabort = () => reject(unavailable(transaction.error));
    });
  }

  /**
   * Loads a precise historical key version without silently replacing it.
   * @param userId - Expected owner of the keyset.
   * @param keyVersion - Version stored beside ciphertext in the outbox.
   * @returns Matching keyset, or `null` after removal or profile loss.
   * @throws {SalesFailure} When local key storage cannot be read.
   */
  async find(userId: UserId, keyVersion: string): Promise<OfflineDraftCryptoKeyset | null> {
    const db = await this.database();
    return new Promise<OfflineDraftCryptoKeyset | null>((resolve, reject) => {
      const transaction = db.transaction(keysetsStoreName, "readonly");
      const request = transaction.objectStore(keysetsStoreName).get([userId, keyVersion]);
      let result: OfflineDraftCryptoKeyset | null = null;
      request.onsuccess = () => { result = request.result ? request.result as OfflineDraftCryptoKeyset : null; };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(unavailable(transaction.error));
      transaction.onabort = () => reject(unavailable(transaction.error));
    });
  }

  /**
   * Closes this profile database connection.
   * @returns Promise fulfilled after an open connection is closed.
   * @throws {SalesFailure} When a pending database open fails.
   */
  async close(): Promise<void> {
    if (!this.databasePromise) return;
    (await this.databasePromise).close();
    this.databasePromise = undefined;
  }

  private async generate(userId: UserId): Promise<OfflineDraftCryptoKeyset> {
    try {
      const [encryptionKey, deduplicationKey] = await Promise.all([
        this.runtime.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
        this.runtime.subtle.generateKey({ name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign", "verify"]),
      ]);
      return Object.freeze({ userId, keyVersion: createUuid(this.runtime), encryptionKey, deduplicationKey });
    } catch (cause: unknown) {
      throw unavailable(cause);
    }
  }

  private readActive(db: IDBDatabase, userId: UserId): Promise<OfflineDraftCryptoKeyset | null> {
    return new Promise<OfflineDraftCryptoKeyset | null>((resolve, reject) => {
      let result: OfflineDraftCryptoKeyset | null = null;
      const transaction = db.transaction([activeStoreName, keysetsStoreName], "readonly");
      const request = transaction.objectStore(activeStoreName).get(userId);
      request.onsuccess = () => {
        if (!request.result) return;
        const active = request.result as ActiveKeysetRecord;
        const keyRequest = transaction.objectStore(keysetsStoreName).get([userId, active.keyVersion]);
        keyRequest.onsuccess = () => { result = keyRequest.result ? keyRequest.result as OfflineDraftCryptoKeyset : null; };
        keyRequest.onerror = () => transaction.abort();
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(unavailable(transaction.error));
      transaction.onabort = () => reject(unavailable(transaction.error));
    });
  }

  private database(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        let request: IDBOpenDBRequest;
        try { request = this.factory.open(this.databaseName, databaseVersion); }
        catch (cause: unknown) { reject(unavailable(cause)); return; }
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(keysetsStoreName)) db.createObjectStore(keysetsStoreName, { keyPath: ["userId", "keyVersion"] });
          if (!db.objectStoreNames.contains(activeStoreName)) db.createObjectStore(activeStoreName, { keyPath: "userId" });
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        };
        request.onerror = () => reject(unavailable(request.error));
        request.onblocked = () => reject(unavailable(new Error("IndexedDB key database upgrade is blocked by another client.")));
      }).catch((cause: unknown) => {
        this.databasePromise = undefined;
        throw cause instanceof SalesFailure ? cause : unavailable(cause);
      });
    }
    return this.databasePromise;
  }
}

function createUuid(runtime: OfflineDraftWebCryptoRuntime): string {
  const bytes = runtime.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function unavailable(cause?: unknown): SalesFailure {
  return new SalesFailure("SALES_OFFLINE_DRAFT_PAYLOAD_UNAVAILABLE", "Secure offline draft key persistence is unavailable.", { cause });
}
