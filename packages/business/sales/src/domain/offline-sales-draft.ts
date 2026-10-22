import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import { SalesFailure } from "./sales-failure";

/** JSON values accepted as a non-authoritative local sales-draft intent. */
export type OfflineDraftJson = null | boolean | number | string | readonly OfflineDraftJson[] | { readonly [key: string]: OfflineDraftJson };

/** Authenticated-encryption output persisted by a platform-owned local adapter. */
export interface SealedOfflineDraftPayload {
  readonly ciphertext: string;
  readonly intentTag: string;
  readonly keyVersion: string;
}

/** Local draft operation state; only a server-accepted draft is synchronized. */
export type OfflineSalesDraftStatus = "pending" | "syncing" | "synced" | "blocked" | "rejected";

/** Stable reason code shown when reconnection cannot safely create the draft. */
export type OfflineSalesDraftFailureCode =
  | "authorization_revoked"
  | "branch_unavailable"
  | "source_changed"
  | "payload_unavailable"
  | "validation_failed"
  | "idempotency_conflict";

/** Non-authoritative, branch-scoped sales-draft operation stored in the local outbox. */
export interface OfflineSalesDraft {
  readonly operationId: string;
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly branchId: string;
  readonly queuedAt: string;
  readonly sealedPayload: SealedOfflineDraftPayload;
  readonly status: OfflineSalesDraftStatus;
  readonly attemptCount: number;
  readonly revision: number;
  readonly leaseId: string | null;
  readonly leaseExpiresAt: string | null;
  readonly serverDraftId: string | null;
  readonly failureCode: OfflineSalesDraftFailureCode | null;
}

/**
 * Validates an outbox row before application or adapter code trusts it.
 * @param value - Untrusted persisted outbox snapshot.
 * @returns Immutable, validated operation metadata and ciphertext reference.
 * @throws {SalesFailure} When scope, state, revision, lease or encryption metadata is malformed.
 */
export function offlineSalesDraft(value: OfflineSalesDraft): OfflineSalesDraft {
  if (!isUuid(value.operationId) || !isUuid(value.actorUserId) || !isUuid(value.organizationId) || !isUuid(value.branchId)
    || !value.companyId.trim() || value.companyId.length > 128 || !validInstant(value.queuedAt)
    || !value.sealedPayload || typeof value.sealedPayload !== "object"
    || !value.sealedPayload.ciphertext || value.sealedPayload.ciphertext.length > 1_000_000
    || !value.sealedPayload.intentTag || value.sealedPayload.intentTag.length > 256
    || !value.sealedPayload.keyVersion || value.sealedPayload.keyVersion.length > 64
    || !Number.isSafeInteger(value.attemptCount) || value.attemptCount < 0
    || !Number.isSafeInteger(value.revision) || value.revision < 1
    || !["pending", "syncing", "synced", "blocked", "rejected"].includes(value.status)
    || !validOptionalUuid(value.leaseId) || !validOptionalInstant(value.leaseExpiresAt)
    || !validOptionalText(value.serverDraftId, 128)
    || (value.leaseId === null) !== (value.leaseExpiresAt === null)
    || (value.status === "syncing") !== (value.leaseId !== null && value.leaseExpiresAt !== null)
    || (value.status === "synced") !== (value.serverDraftId !== null)
    || (value.failureCode !== null && !["authorization_revoked", "branch_unavailable", "source_changed", "payload_unavailable", "validation_failed", "idempotency_conflict"].includes(value.failureCode))
    || (["blocked", "rejected"].includes(value.status) !== (value.failureCode !== null))) {
    throw new SalesFailure("SALES_OFFLINE_DRAFT_INVALID", "Offline sales draft outbox data is invalid.");
  }
  return Object.freeze({ ...value, sealedPayload: Object.freeze({ ...value.sealedPayload }) });
}

/**
 * Creates an exclusively pending local draft operation.
 * @param input - Stable operation identity, scope, queue time and protected payload.
 * @returns Immutable pending outbox operation at revision one.
 * @throws {SalesFailure} When identity, scope, time or protected payload is invalid.
 */
export function newOfflineSalesDraft(input: {
  readonly operationId: string;
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly branchId: string;
  readonly queuedAt: string;
  readonly sealedPayload: SealedOfflineDraftPayload;
}): OfflineSalesDraft {
  return offlineSalesDraft({ ...input, status: "pending", attemptCount: 0, revision: 1, leaseId: null, leaseExpiresAt: null, serverDraftId: null, failureCode: null });
}

/**
 * Applies the repository's atomic claim to one pending or expired operation.
 * @param value - Candidate operation returned by local persistence.
 * @param leaseId - Unique identifier of the new processing lease.
 * @param now - Current local instant used only for lease arbitration.
 * @param leaseExpiresAt - Future expiry of this processing lease.
 * @returns Claimed operation with incremented attempt and revision.
 * @throws {SalesFailure} When the operation is not claimable or lease data is invalid.
 */
export function claimOfflineSalesDraft(value: OfflineSalesDraft, leaseId: string, now: string, leaseExpiresAt: string): OfflineSalesDraft {
  const draft = offlineSalesDraft(value);
  if (!isUuid(leaseId) || !validInstant(now) || !validInstant(leaseExpiresAt) || Date.parse(leaseExpiresAt) <= Date.parse(now)
    || (draft.status !== "pending" && !(draft.status === "syncing" && draft.leaseExpiresAt !== null && Date.parse(draft.leaseExpiresAt) <= Date.parse(now)))) {
    throw new SalesFailure("SALES_OFFLINE_DRAFT_LEASE_CONFLICT", "Offline sales draft cannot be claimed with this lease.");
  }
  return offlineSalesDraft({ ...draft, status: "syncing", attemptCount: draft.attemptCount + 1, revision: draft.revision + 1, leaseId, leaseExpiresAt });
}

/**
 * Settles a claimed operation while preserving retry idempotency.
 * @param value - Currently claimed operation.
 * @param leaseId - Lease that performed the remote attempt.
 * @param result - Authoritative server result or uncertain transport retry.
 * @returns Updated operation with cleared lease and incremented revision.
 * @throws {SalesFailure} When the lease is stale, result is malformed, or accepted identity is invalid.
 */
export function settleOfflineSalesDraft(value: OfflineSalesDraft, leaseId: string, result: OfflineSalesDraftSettlement): OfflineSalesDraft {
  const draft = offlineSalesDraft(value);
  if (!result || !["synced", "blocked", "rejected", "retry"].includes(result.kind)
    || draft.status !== "syncing" || draft.leaseId !== leaseId) {
    throw new SalesFailure("SALES_OFFLINE_DRAFT_LEASE_CONFLICT", "Offline sales draft lease is stale or belongs to another synchronizer.");
  }
  if (result.kind === "retry") {
    return offlineSalesDraft({ ...draft, status: "pending", revision: draft.revision + 1, leaseId: null, leaseExpiresAt: null, failureCode: null });
  }
  if (result.kind === "synced") {
    const serverDraftId = result.serverDraftId.trim();
    if (!serverDraftId || serverDraftId.length > 128) throw new SalesFailure("SALES_OFFLINE_DRAFT_INVALID", "Server draft identifier is invalid.");
    return offlineSalesDraft({ ...draft, status: "synced", revision: draft.revision + 1, leaseId: null, leaseExpiresAt: null, serverDraftId, failureCode: null });
  }
  const status = result.kind;
  return offlineSalesDraft({ ...draft, status, revision: draft.revision + 1, leaseId: null, leaseExpiresAt: null, failureCode: result.code });
}

/** Typed outcome returned by the authenticated server-side draft creator. */
export type OfflineSalesDraftSettlement =
  | { readonly kind: "synced"; readonly serverDraftId: string }
  | { readonly kind: "blocked"; readonly code: Exclude<OfflineSalesDraftFailureCode, "validation_failed" | "idempotency_conflict"> }
  | { readonly kind: "rejected"; readonly code: Extract<OfflineSalesDraftFailureCode, "validation_failed" | "idempotency_conflict"> }
  | { readonly kind: "retry" };

function validInstant(value: string): boolean { return Number.isFinite(Date.parse(value)); }
function validOptionalInstant(value: string | null): boolean { return value === null || validInstant(value); }
function validOptionalUuid(value: string | null): boolean { return value === null || isUuid(value); }
function validOptionalText(value: string | null, max: number): boolean { return value === null || (!!value.trim() && value.length <= max); }
function isUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
