import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import {
  SalesFailure,
  newOfflineSalesDraft,
  offlineSalesDraft,
  type OfflineDraftJson,
  type OfflineSalesDraft,
  type OfflineSalesDraftSettlement,
  type SealedOfflineDraftPayload,
} from "../domain";

/** Clear-text scope authenticated as associated data by a platform payload protector. */
export interface OfflineDraftPayloadBinding {
  readonly operationId: string;
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly branchId: string;
}

/** Device-keystore-backed authenticated encryption boundary for local drafts. */
export interface OfflineDraftPayloadProtector {
  /** Encrypts payload for one exact user/company/branch/operation binding. @param binding - Scope authenticated as associated data. @param plaintext - Canonical JSON payload. @returns Ciphertext and stable keyed deduplication tag; plaintext must not be persisted. @throws {SalesFailure} When local encryption or key access fails. */
  seal(binding: OfflineDraftPayloadBinding, plaintext: string): Promise<SealedOfflineDraftPayload>;
  /** Opens only ciphertext authenticated for the original operation binding. @param binding - Scope that must match encryption associated data. @param sealed - Stored encrypted payload. @returns Original canonical JSON. @throws {SalesFailure} When the key is missing or authentication fails. */
  open(binding: OfflineDraftPayloadBinding, sealed: SealedOfflineDraftPayload): Promise<string>;
}

/** Result of idempotently inserting an encrypted local outbox operation. */
export interface OfflineSalesDraftEnqueueResult {
  readonly operation: OfflineSalesDraft;
  readonly created: boolean;
}

/** Durable local outbox contract; claims and settlements must use atomic local transactions. */
export interface OfflineSalesDraftRepository {
  /** Inserts once per operation UUID, replaying only an identical encrypted intent. @param operation - Encrypted draft and stable idempotency key. @returns Existing or newly stored operation. @throws {SalesFailure} On an intent mismatch or local storage failure. */
  enqueue(operation: OfflineSalesDraft): Promise<OfflineSalesDraftEnqueueResult>;
  /** Atomically claims the oldest eligible operation for one signed-in user; expired leases may be recovered. @param input - Actor and unique bounded processing lease. @returns Claimed operation, or `null` when none is eligible. @throws {SalesFailure} When storage or lease validation fails. */
  claimNext(input: { readonly actorUserId: UserId; readonly leaseId: string; readonly now: string; readonly leaseExpiresAt: string }): Promise<OfflineSalesDraft | null>;
  /** Atomically records a result only when its revision and lease are still current. @param input - Operation identity, current revision, lease and server outcome. @returns Updated operation. @throws {SalesFailure} On a stale claim or local storage failure. */
  settle(input: { readonly operationId: string; readonly expectedRevision: number; readonly leaseId: string; readonly result: OfflineSalesDraftSettlement }): Promise<OfflineSalesDraft>;
}

/** Authenticated server command that may create a draft and no other sales effect. */
export interface OfflineSalesDraftGateway {
  /** Derives the current actor from the authenticated session, compares it with the queued actor, revalidates organization/company/branch assignment and current customer/product data, then creates only a draft. It must use `operationId` as its idempotency key and return `retry` for uncertain transport outcomes. @param input - Original scope, stable operation ID and decrypted intent; queued actor is not authentication evidence. @returns Durable acceptance, permanent block/rejection, or safe retry classification. @throws {SalesFailure} Unexpected failures are treated as retryable uncertainty. */
  createDraft(input: OfflineDraftPayloadBinding & { readonly payload: OfflineDraftJson }): Promise<OfflineSalesDraftSettlement>;
}

/** Trusted server-session boundary used before an offline queue actor can reach persistence. */
export interface OfflineSalesDraftSessionActorResolver {
  /**
   * Resolves the actor of the current authenticated server session.
   * @returns The trusted session actor, or `null` if no valid session exists.
   * @throws {SalesFailure} When the session provider cannot be consulted; callers must treat this as retryable uncertainty.
   */
  resolveActorUserId(): Promise<UserId | null>;
}

/** Clock used for local queue display and bounded claim leases; never supplies business dates. */
export interface OfflineDraftClock {
  /** @returns Current ISO timestamp. @throws {SalesFailure} When no valid local time is available. */
  now(): string;
}

/** Supplies unique claim identifiers that survive no process restart. */
export interface OfflineDraftLeaseIdSource {
  /** @returns A unique UUID for one local claim attempt. @throws {SalesFailure} When the platform cannot generate an identifier. */
  next(): string;
}

/** Stores an encrypted sales-order draft intent without assigning a server document number. */
export class QueueOfflineSalesDraft {
  /** @param drafts - Durable local outbox. @param protector - Device-keystore-backed encryption. @param clock - Local queue timestamp source. @returns Use case. */
  constructor(private readonly drafts: OfflineSalesDraftRepository, private readonly protector: OfflineDraftPayloadProtector, private readonly clock: OfflineDraftClock) {}

  /** @param command - Stable operation UUID, authenticated scope and JSON draft intent. @returns Stored pending operation or idempotent replay. @throws {SalesFailure} When input, encryption, persistence or idempotency is invalid. */
  async execute(command: OfflineDraftPayloadBinding & { readonly payload: OfflineDraftJson }): Promise<OfflineSalesDraftEnqueueResult> {
    const binding = validateBinding(command);
    const plaintext = canonicalPayload(command.payload);
    const sealedPayload = await this.protector.seal(binding, plaintext);
    const candidate = newOfflineSalesDraft({ ...binding, queuedAt: validInstant(this.clock.now()), sealedPayload });
    const result = await this.drafts.enqueue(candidate);
    const stored = offlineSalesDraft(result.operation);
    if (!sameBinding(binding, stored) || stored.sealedPayload.intentTag !== sealedPayload.intentTag) {
      throw new SalesFailure("SALES_OFFLINE_DRAFT_IDEMPOTENCY_CONFLICT", "The operation ID already belongs to another offline draft intent.");
    }
    return Object.freeze({ operation: stored, created: result.created });
  }
}

/** Replays eligible draft intents sequentially using stable idempotency and server revalidation. */
export class SynchronizeOfflineSalesDrafts {
  private static readonly leaseDurationMs = 120_000;

  /** @param drafts - Atomic local outbox. @param protector - Device-keystore-backed encryption. @param gateway - Authenticated online draft creator. @param clock - Local lease clock. @param leaseIds - UUID source for exclusive claims. @returns Use case. */
  constructor(
    private readonly drafts: OfflineSalesDraftRepository,
    private readonly protector: OfflineDraftPayloadProtector,
    private readonly gateway: OfflineSalesDraftGateway,
    private readonly clock: OfflineDraftClock,
    private readonly leaseIds: OfflineDraftLeaseIdSource,
  ) {}

  /** @param actorUserId - Currently authenticated local user. @param limit - Maximum sequential claims (1–50). @returns Synced, blocked, rejected and retry counts. @throws {SalesFailure} When input, local storage, clock or lease generation fails. @effects Each claim is exclusive; retries keep the operation UUID as its server idempotency key. */
  async execute(actorUserId: UserId, limit = 20): Promise<{ readonly synced: number; readonly blocked: number; readonly rejected: number; readonly retried: number }> {
    if (!isUuid(actorUserId) || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new SalesFailure("SALES_OFFLINE_DRAFT_INVALID", "Offline draft synchronization scope or batch size is invalid.");
    }
    const totals = { synced: 0, blocked: 0, rejected: 0, retried: 0 };
    for (let index = 0; index < limit; index += 1) {
      const now = validInstant(this.clock.now());
      const leaseId = uuid(this.leaseIds.next());
      const leaseExpiresAt = new Date(Date.parse(now) + SynchronizeOfflineSalesDrafts.leaseDurationMs).toISOString();
      const claimed = await this.drafts.claimNext({ actorUserId, leaseId, now, leaseExpiresAt });
      if (claimed === null) break;
      const operation = offlineSalesDraft(claimed);
      if (operation.status !== "syncing" || operation.leaseId !== leaseId || operation.actorUserId !== actorUserId) {
        throw new SalesFailure("SALES_OFFLINE_DRAFT_LEASE_CONFLICT", "Local outbox returned an operation outside its claim.");
      }
      const binding = bindingOf(operation);
      let payload: OfflineDraftJson | undefined;
      try {
        const plaintext = await this.protector.open(binding, operation.sealedPayload);
        payload = parseCanonicalPayload(plaintext);
      } catch {
        payload = undefined;
      }
      let result: OfflineSalesDraftSettlement;
      if (payload === undefined) result = { kind: "blocked", code: "payload_unavailable" };
      else {
        try { result = await this.gateway.createDraft({ ...binding, payload }); }
        catch { result = { kind: "retry" }; }
      }
      await this.drafts.settle({ operationId: operation.operationId, expectedRevision: operation.revision, leaseId, result });
      if (result.kind === "synced") totals.synced += 1;
      else if (result.kind === "blocked") totals.blocked += 1;
      else if (result.kind === "rejected") totals.rejected += 1;
      else { totals.retried += 1; break; }
    }
    return Object.freeze(totals);
  }
}

function validateBinding(input: OfflineDraftPayloadBinding): OfflineDraftPayloadBinding {
  if (!isUuid(input.operationId) || !isUuid(input.actorUserId) || !isUuid(input.organizationId) || !isUuid(input.branchId)
    || !input.companyId.trim() || input.companyId.length > 128) {
    throw new SalesFailure("SALES_OFFLINE_DRAFT_INVALID", "Offline sales draft scope or operation ID is invalid.");
  }
  return Object.freeze({ operationId: input.operationId.toLowerCase(), actorUserId: input.actorUserId.toLowerCase() as UserId,
    organizationId: input.organizationId.toLowerCase() as OrganizationId, branchId: input.branchId.toLowerCase(), companyId: input.companyId.trim() as CompanyId });
}

function bindingOf(operation: OfflineSalesDraft): OfflineDraftPayloadBinding {
  return { operationId: operation.operationId, actorUserId: operation.actorUserId, organizationId: operation.organizationId, companyId: operation.companyId, branchId: operation.branchId };
}

function sameBinding(binding: OfflineDraftPayloadBinding, operation: OfflineSalesDraft): boolean {
  return binding.operationId === operation.operationId && binding.actorUserId === operation.actorUserId
    && binding.organizationId === operation.organizationId && binding.companyId === operation.companyId && binding.branchId === operation.branchId;
}

function canonicalPayload(value: OfflineDraftJson): string {
  let nodes = 0;
  const normalize = (candidate: OfflineDraftJson, depth: number): OfflineDraftJson => {
    nodes += 1;
    if (nodes > 10_000 || depth > 20) throw new SalesFailure("SALES_OFFLINE_DRAFT_INVALID", "Offline draft payload exceeds structural limits.");
    if (candidate === null || typeof candidate === "boolean" || typeof candidate === "string") return candidate;
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) throw new SalesFailure("SALES_OFFLINE_DRAFT_INVALID", "Offline draft payload contains a non-finite number.");
      return candidate;
    }
    if (Array.isArray(candidate)) return candidate.map((entry) => normalize(entry, depth + 1));
    if (typeof candidate === "object") {
      const source = candidate as Readonly<Record<string, OfflineDraftJson>>;
      const output: Record<string, OfflineDraftJson> = Object.create(null) as Record<string, OfflineDraftJson>;
      for (const key of Object.keys(source).sort()) {
        if (key === "__proto__" || key === "prototype" || key === "constructor") throw new SalesFailure("SALES_OFFLINE_DRAFT_INVALID", "Offline draft payload contains a reserved property.");
        output[key] = normalize(source[key]!, depth + 1);
      }
      return output;
    }
    throw new SalesFailure("SALES_OFFLINE_DRAFT_INVALID", "Offline draft payload is not JSON data.");
  };
  const serialized = JSON.stringify(normalize(value, 0));
  if (utf8ByteLength(serialized) > 65_536) throw new SalesFailure("SALES_OFFLINE_DRAFT_INVALID", "Offline draft payload exceeds 64 KiB.");
  return serialized;
}

function parseCanonicalPayload(value: string): OfflineDraftJson {
  try {
    const parsed = JSON.parse(value) as OfflineDraftJson;
    if (canonicalPayload(parsed) !== value) throw new Error("Payload is not canonical.");
    return deepFreeze(parsed);
  } catch (cause: unknown) {
    throw new SalesFailure("SALES_OFFLINE_DRAFT_PAYLOAD_UNAVAILABLE", "Encrypted offline draft payload could not be validated.", { cause });
  }
}

function deepFreeze<T extends OfflineDraftJson>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Array.isArray(value) ? value : Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validInstant(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new SalesFailure("SALES_OFFLINE_DRAFT_INVALID", "Offline queue timestamp is invalid.");
  return new Date(Date.parse(value)).toISOString();
}

function uuid(value: string): string {
  if (!isUuid(value)) throw new SalesFailure("SALES_OFFLINE_DRAFT_INVALID", "Offline synchronization lease ID must be a UUID.");
  return value.toLowerCase();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function utf8ByteLength(value: string): number {
  let length = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return length;
}
