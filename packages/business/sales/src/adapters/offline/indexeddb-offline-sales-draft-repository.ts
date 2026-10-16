import type { UserId } from "@kontave/organizations/domain";
import {
  SalesFailure,
  claimOfflineSalesDraft,
  offlineSalesDraft,
  settleOfflineSalesDraft,
  type OfflineSalesDraft,
} from "../../domain";
import type { OfflineSalesDraftEnqueueResult, OfflineSalesDraftRepository } from "../../application/offline-sales-drafts";

const databaseVersion = 1;
const draftsStoreName = "offline-sales-drafts";
const actorQueueIndexName = "actor-queue";

/** Durable browser outbox; the platform must protect the database profile and supply device-bound keys. */
export class IndexedDbOfflineSalesDraftRepository implements OfflineSalesDraftRepository {
  private databasePromise: Promise<IDBDatabase> | undefined;

  /**
   * @param factory - IndexedDB factory belonging to the current browser profile.
   * @param databaseName - Isolated per-application database name.
   * @returns Repository whose writes and lease transitions commit atomically.
   * @throws {SalesFailure} When IndexedDB is unavailable or cannot open this database.
   */
  constructor(private readonly factory: IDBFactory, private readonly databaseName = "kontave-offline-sales") {
    if (!databaseName.trim() || databaseName.length > 128) {
      throw new SalesFailure("SALES_OFFLINE_DRAFT_STORAGE_UNAVAILABLE", "Offline outbox database name is invalid.");
    }
  }

  /**
   * Inserts once per operation UUID, allowing a retry only for the same scoped intent tag.
   * @param operation - Validated encrypted outbox row.
   * @returns Existing or newly committed row and whether it was inserted.
   * @throws {SalesFailure} When a key is reused for another intent or IndexedDB fails.
   */
  async enqueue(operation: OfflineSalesDraft): Promise<OfflineSalesDraftEnqueueResult> {
    const candidate = offlineSalesDraft(operation);
    const db = await this.database();
    return new Promise<OfflineSalesDraftEnqueueResult>((resolve, reject) => {
      let result: OfflineSalesDraftEnqueueResult | undefined;
      const transaction = db.transaction(draftsStoreName, "readwrite");
      const store = transaction.objectStore(draftsStoreName);
      const request = store.get(candidate.operationId);
      request.onsuccess = () => {
        try {
          const existing = request.result === undefined ? undefined : offlineSalesDraft(request.result as OfflineSalesDraft);
          if (existing) {
            if (!sameIntent(existing, candidate)) throw new SalesFailure("SALES_OFFLINE_DRAFT_IDEMPOTENCY_CONFLICT", "Operation ID already belongs to another offline intent.");
            result = Object.freeze({ operation: existing, created: false });
          } else {
            store.add(candidate);
            result = Object.freeze({ operation: candidate, created: true });
          }
        } catch (cause: unknown) {
          rejectAsStorageOrDomainFailure(cause, reject);
          transaction.abort();
        }
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => result ? resolve(result) : reject(storageFailure());
      transaction.onerror = () => reject(storageFailure(transaction.error));
      transaction.onabort = () => reject(transaction.error instanceof DOMException && transaction.error.name === "ConstraintError"
        ? new SalesFailure("SALES_OFFLINE_DRAFT_IDEMPOTENCY_CONFLICT", "Operation ID already exists in the offline outbox.", { cause: transaction.error })
        : storageFailure(transaction.error));
    });
  }

  /**
   * Claims the oldest pending or expired row for an actor in one readwrite transaction.
   * @param input - Actor and unique future lease values.
   * @returns The committed claim, or `null` when no eligible row exists.
   * @throws {SalesFailure} When claim values are invalid or IndexedDB cannot commit.
   */
  async claimNext(input: { readonly actorUserId: UserId; readonly leaseId: string; readonly now: string; readonly leaseExpiresAt: string }): Promise<OfflineSalesDraft | null> {
    const db = await this.database();
    return new Promise<OfflineSalesDraft | null>((resolve, reject) => {
      let result: OfflineSalesDraft | null = null;
      const transaction = db.transaction(draftsStoreName, "readwrite");
      const store = transaction.objectStore(draftsStoreName);
      const range = IDBKeyRange.bound([input.actorUserId, "", ""], [input.actorUserId, "\uffff", "\uffff"]);
      const request = store.index(actorQueueIndexName).getAll(range);
      request.onsuccess = () => {
        try {
          const candidates = (request.result as OfflineSalesDraft[]).map(offlineSalesDraft);
          const eligible = candidates.find((row) => row.status === "pending"
            || (row.status === "syncing" && row.leaseExpiresAt !== null && Date.parse(row.leaseExpiresAt) <= Date.parse(input.now)));
          if (eligible) {
            result = claimOfflineSalesDraft(eligible, input.leaseId, input.now, input.leaseExpiresAt);
            store.put(result);
          }
        } catch (cause: unknown) {
          rejectAsStorageOrDomainFailure(cause, reject);
          transaction.abort();
        }
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(storageFailure(transaction.error));
      transaction.onabort = () => reject(storageFailure(transaction.error));
    });
  }

  /**
   * Settles a claim only if the stored revision and lease still match the worker.
   * @param input - Operation, claimed revision/lease, and gateway outcome.
   * @returns The committed state transition.
   * @throws {SalesFailure} When the claim is stale, row is absent, or storage fails.
   */
  async settle(input: { readonly operationId: string; readonly expectedRevision: number; readonly leaseId: string; readonly result: Parameters<typeof settleOfflineSalesDraft>[2] }): Promise<OfflineSalesDraft> {
    const db = await this.database();
    return new Promise<OfflineSalesDraft>((resolve, reject) => {
      let result: OfflineSalesDraft | undefined;
      let domainError: SalesFailure | undefined;
      const transaction = db.transaction(draftsStoreName, "readwrite");
      const store = transaction.objectStore(draftsStoreName);
      const request = store.get(input.operationId);
      request.onsuccess = () => {
        try {
          if (request.result === undefined) throw new SalesFailure("SALES_OFFLINE_DRAFT_LEASE_CONFLICT", "Offline draft claim no longer exists.");
          const current = offlineSalesDraft(request.result as OfflineSalesDraft);
          if (current.revision !== input.expectedRevision) throw new SalesFailure("SALES_OFFLINE_DRAFT_LEASE_CONFLICT", "Offline draft claim revision is stale.");
          result = settleOfflineSalesDraft(current, input.leaseId, input.result);
          store.put(result);
        } catch (cause: unknown) {
          if (cause instanceof SalesFailure) domainError = cause;
          else domainError = storageFailure(cause);
          transaction.abort();
        }
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => result ? resolve(result) : reject(storageFailure());
      transaction.onerror = () => reject(domainError ?? storageFailure(transaction.error));
      transaction.onabort = () => reject(domainError ?? storageFailure(transaction.error));
    });
  }

  /**
   * Closes the connection so the host can release the profile database cleanly.
   * @returns Promise fulfilled after any pending open request resolves and closes.
   * @throws {SalesFailure} When the database could not be opened.
   */
  async close(): Promise<void> {
    if (!this.databasePromise) return;
    (await this.databasePromise).close();
    this.databasePromise = undefined;
  }

  private database(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        let request: IDBOpenDBRequest;
        try { request = this.factory.open(this.databaseName, databaseVersion); }
        catch (cause: unknown) { reject(storageFailure(cause)); return; }
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(draftsStoreName)) {
            const store = db.createObjectStore(draftsStoreName, { keyPath: "operationId" });
            store.createIndex(actorQueueIndexName, ["actorUserId", "queuedAt", "operationId"], { unique: false });
          }
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        };
        request.onerror = () => reject(storageFailure(request.error));
        request.onblocked = () => reject(storageFailure(new Error("IndexedDB upgrade is blocked by another open client.")));
      }).catch((cause: unknown) => {
        this.databasePromise = undefined;
        throw cause instanceof SalesFailure ? cause : storageFailure(cause);
      });
    }
    return this.databasePromise;
  }
}

function sameIntent(left: OfflineSalesDraft, right: OfflineSalesDraft): boolean {
  return left.actorUserId === right.actorUserId && left.organizationId === right.organizationId
    && left.companyId === right.companyId && left.branchId === right.branchId
    && left.sealedPayload.intentTag === right.sealedPayload.intentTag;
}

function rejectAsStorageOrDomainFailure(cause: unknown, reject: (reason?: unknown) => void): void {
  reject(cause instanceof SalesFailure ? cause : storageFailure(cause));
}

function storageFailure(cause?: unknown): SalesFailure {
  return new SalesFailure("SALES_OFFLINE_DRAFT_STORAGE_UNAVAILABLE", "Could not commit the local offline sales outbox operation.", { cause });
}
