import type { CompanyId } from "@kontave/companies/domain";
import type { FiscalDocument } from "./document";
import { FiscalFailure } from "./fiscal-failure";

/** Provider-neutral status captured after an attempt to issue an outbound document. */
export type FiscalIssuanceAttemptState = "pending" | "accepted" | "rejected" | "unknown";

/** Immutable source identity supplied by the context that prepared a fiscal document. */
export interface FiscalDocumentSourceIdentity {
  readonly kind: string;
  readonly id: string;
}

/** Scope that every fiscal persistence operation must carry. */
export interface FiscalPersistenceScope {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: CompanyId;
}

/** Stable keyset cursor for traversing fiscal documents in reverse creation order. */
export interface FiscalDocumentCursor {
  readonly createdAt: string;
  readonly id: string;
}

/** Keyset page requested from an already authorized fiscal company scope. */
export interface FiscalDocumentPageRequest {
  readonly limit: number;
  readonly cursor: FiscalDocumentCursor | null;
}

/** One durable fiscal snapshot and its storage timestamp for list presentation. */
export interface FiscalDocumentListItem {
  readonly document: FiscalDocument;
  readonly createdAt: string;
}

/** Page of durable fiscal documents; the cursor is null when the result is exhausted. */
export interface FiscalDocumentPage {
  readonly items: readonly FiscalDocumentListItem[];
  readonly nextCursor: FiscalDocumentCursor | null;
}

/** Immutable fiscal lifecycle event recorded with a document mutation. */
export interface FiscalDocumentEvent {
  readonly id: string;
  readonly eventType: string;
  readonly idempotencyKey: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
  readonly recordedAt: string;
}

/** Keyset page of immutable document events. */
export interface FiscalDocumentEventPage {
  readonly items: readonly FiscalDocumentEvent[];
  readonly nextCursor: FiscalDocumentCursor | null;
}

/** An immutable, provider-neutral request/result record for one issuance attempt. */
export interface FiscalIssuanceAttempt {
  readonly id: string;
  readonly documentId: string;
  readonly provider: string;
  readonly idempotencyKey: string;
  readonly state: FiscalIssuanceAttemptState;
  readonly requestFingerprint: string;
  readonly providerReference: string | null;
  readonly failureCode: string | null;
  readonly occurredAt: string;
  /** Issued aggregate required only when the provider accepted this attempt. */
  readonly issuedDocument: FiscalDocument | null;
}

/** Input that atomically persists a document snapshot and its preparation event. */
export interface PersistFiscalDocumentInput {
  readonly scope: FiscalPersistenceScope;
  readonly source: FiscalDocumentSourceIdentity;
  readonly document: FiscalDocument;
  readonly idempotencyKey: string;
  readonly actorId: string | null;
  readonly occurredAt: string;
}

/** Result of an idempotent document persistence operation. */
export interface PersistFiscalDocumentResult {
  readonly document: FiscalDocument;
  readonly replayed: boolean;
}

/**
 * Defines the transaction boundary for durable fiscal-document persistence.
 *
 * Implementations must scope every lookup by tenant, organization, and company;
 * persist the document snapshot and event in one transaction; and treat a repeated
 * idempotency key with different content as a conflict.
 */
export interface FiscalDocumentRepository {
  /**
   * Finds a document by its durable identity within an operational scope.
   *
   * @param scope - Tenant, organization, and company that own the document.
   * @param documentId - Stable fiscal-document identity.
   * @returns The stored aggregate, or `null` when it does not exist in the scope.
   */
  find(scope: FiscalPersistenceScope, documentId: string): Promise<FiscalDocument | null>;

  /**
   * Lists fiscal documents in reverse creation order using a stable keyset cursor.
   *
   * @param scope - Tenant, organization, and company that own the documents.
   * @param request - Bounded page size and optional cursor from the preceding page.
   * @returns The requested page and a cursor for the next page, if one exists.
   * @throws {@link FiscalFailure} When the page request is invalid or persistence fails.
   */
  list(scope: FiscalPersistenceScope, request: FiscalDocumentPageRequest): Promise<FiscalDocumentPage>;

  /**
   * Lists the append-only lifecycle history of one fiscal document.
   * @param scope - Tenant, organization, and company that own the document.
   * @param documentId - Stable fiscal-document identity.
   * @param request - Bounded page size and optional reverse-chronological cursor.
   * @returns Immutable lifecycle events and a cursor for the next page, when present.
   * @throws {@link FiscalFailure} When scope, cursor, or persistence validation fails.
   */
  listEvents(scope: FiscalPersistenceScope, documentId: string, request: FiscalDocumentPageRequest): Promise<FiscalDocumentEventPage>;

  /**
   * Saves a draft document and its `fiscal_document.prepared` event atomically.
   *
   * @param input - Scoped aggregate snapshot, source identity, idempotency key, and event time.
   * @returns The newly stored document or an equivalent idempotent replay.
   * @throws {@link FiscalFailure} When a source identity or idempotency key conflicts.
   */
  persist(input: PersistFiscalDocumentInput): Promise<PersistFiscalDocumentResult>;

  /**
   * Appends an issuance attempt without mutating prior provider evidence.
   *
   * @param scope - Tenant, organization, and company that own the document.
   * @param attempt - Immutable provider-neutral attempt outcome.
   * @returns The stored attempt, or its exact idempotent replay.
   * @throws {@link FiscalFailure} When the document is outside the scope or the attempt key conflicts.
   */
  appendIssuanceAttempt(scope: FiscalPersistenceScope, attempt: FiscalIssuanceAttempt): Promise<FiscalIssuanceAttempt>;
}

/**
 * Validates a fiscal document page request before database access.
 *
 * @param request - Requested maximum page size and optional keyset cursor.
 * @returns An immutable request with normalized cursor values.
 * @throws {@link FiscalFailure} When the page size or cursor is malformed.
 */
export function fiscalDocumentPageRequest(request: FiscalDocumentPageRequest): FiscalDocumentPageRequest {
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100) {
    throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Fiscal document page limit must be between 1 and 100.");
  }
  if (request.cursor === null) return { limit: request.limit, cursor: null };
  const createdAt = required(request.cursor.createdAt, "page cursor timestamp");
  const id = required(request.cursor.id, "page cursor document id");
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Fiscal document page cursor timestamp is invalid.");
  }
  return { limit: request.limit, cursor: { createdAt, id } };
}

/**
 * Validates an issuance attempt before it crosses the persistence boundary.
 *
 * @param attempt - Provider-neutral attempt data to normalize.
 * @returns An immutable normalized attempt.
 * @throws {@link FiscalFailure} When required durable audit fields are blank.
 */
export function fiscalIssuanceAttempt(attempt: FiscalIssuanceAttempt): FiscalIssuanceAttempt {
  if ((attempt.state === "accepted") !== (attempt.issuedDocument !== null)) {
    throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Accepted issuance attempts require their issued document snapshot.");
  }
  if (attempt.issuedDocument !== null && (
    attempt.issuedDocument.id !== attempt.documentId ||
    attempt.issuedDocument.status !== "issued" ||
    attempt.issuedDocument.direction !== "issued" ||
    attempt.issuedDocument.issuanceEvidence === null ||
    attempt.issuedDocument.issuanceEvidence.provider !== attempt.provider
  )) {
    throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Issued snapshot does not match the accepted fiscal command.");
  }
  return {
    ...attempt,
    id: required(attempt.id, "attempt id"),
    documentId: required(attempt.documentId, "attempt document id"),
    provider: required(attempt.provider, "issuance provider"),
    idempotencyKey: required(attempt.idempotencyKey, "attempt idempotency key"),
    requestFingerprint: required(attempt.requestFingerprint, "attempt request fingerprint"),
    occurredAt: required(attempt.occurredAt, "attempt occurrence time"),
    providerReference: nullable(attempt.providerReference),
    failureCode: nullable(attempt.failureCode),
  };
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 256) {
    throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", `Fiscal ${field} is invalid.`);
  }
  return normalized;
}

function nullable(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}
