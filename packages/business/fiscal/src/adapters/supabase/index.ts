import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fiscalIssuanceAttempt,
  fiscalDocumentPageRequest,
  type FiscalDocumentRepository,
  type FiscalDocumentEventPage,
  type FiscalDocumentPage,
  type FiscalDocumentPageRequest,
  type FiscalIssuanceAttempt,
  type FiscalPersistenceScope,
  type PersistFiscalDocumentInput,
  type PersistFiscalDocumentResult,
} from "../../domain";
import { FiscalFailure } from "../../domain/fiscal-failure";
import { decodeFiscalDocument, encodeFiscalDocument } from "./persistence-codecs";

export { decodeFiscalDocument, encodeFiscalDocument } from "./persistence-codecs";

type StoredDocument = { readonly document_snapshot: unknown };

/** Persists fiscal aggregates through scoped, service-role-only PostgreSQL RPCs. */
export class SupabaseFiscalDocumentRepository implements FiscalDocumentRepository {
  /**
   * Creates the fiscal persistence adapter.
   * @param client - Server-side Supabase client with service-role RPC access.
   * @throws {FiscalFailure} When the client is unavailable.
   */
  constructor(private readonly client: SupabaseClient) {
    if (!client) throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Fiscal persistence requires a server database client.");
  }

  /**
   * Finds a document without exposing its table to browser roles.
   * @param scope - Tenant, organization, and company that own the document.
   * @param documentId - Stable fiscal-document identifier.
   * @returns The revalidated document or `null` when absent in that scope.
   * @throws {FiscalFailure} When the query fails or stored data violates domain invariants.
   */
  async find(scope: FiscalPersistenceScope, documentId: string) {
    const { data, error } = await this.client.rpc("shared_fiscal_document_find", {
      p_tenant_id: scope.tenantId,
      p_organization_id: scope.organizationId,
      p_company_id: scope.companyId,
      p_document_id: documentId,
    });
    if (error) throw persistenceFailure(error.message);
    if (data === null) return null;
    const row = asRecord(data, "Fiscal document query returned an invalid row.");
    return decodeFiscalDocument((row as StoredDocument).document_snapshot);
  }

  /**
   * Lists documents with a stable keyset cursor inside a fully qualified company scope.
   * @param scope - Tenant, organization, and company that own the documents.
   * @param request - Bounded page size and optional cursor.
   * @returns Revalidated fiscal snapshots and the next cursor when another page exists.
   * @throws {FiscalFailure} When the request, stored snapshot, or RPC response is invalid.
   */
  async list(scope: FiscalPersistenceScope, request: FiscalDocumentPageRequest): Promise<FiscalDocumentPage> {
    const normalized = fiscalDocumentPageRequest(request);
    const { data, error } = await this.client.rpc("shared_fiscal_document_list", {
      p_tenant_id: scope.tenantId,
      p_organization_id: scope.organizationId,
      p_company_id: scope.companyId,
      p_limit: normalized.limit,
      p_cursor_created_at: normalized.cursor?.createdAt ?? null,
      p_cursor_id: normalized.cursor?.id ?? null,
    });
    if (error) throw persistenceFailure(error.message);
    const result = asRecord(data, "Fiscal document listing returned an invalid page.");
    if (!Array.isArray(result.items)) {
      throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Fiscal document listing omitted its items.");
    }
    const items = result.items.map((value) => {
      const row = asRecord(value, "Fiscal document listing returned an invalid item.");
      return {
        document: decodeFiscalDocument((row as StoredDocument).document_snapshot),
        createdAt: required(row.created_at, "creation timestamp"),
      };
    });
    if (result.nextCursor === null) return { items, nextCursor: null };
    const nextCursor = asRecord(result.nextCursor, "Fiscal document listing returned an invalid cursor.");
    return {
      items,
      nextCursor: {
        createdAt: required(nextCursor.createdAt, "next cursor timestamp"),
        id: required(nextCursor.id, "next cursor document id"),
      },
    };
  }

  /**
   * Lists immutable lifecycle events for a document using a scoped RPC.
   * @param scope - Tenant, organization, and company that own the document.
   * @param documentId - Stable fiscal-document identity.
   * @param request - Bounded page size and optional event cursor.
   * @returns The event page and its next cursor, if any.
   * @throws {FiscalFailure} When request or persisted event data is invalid.
   */
  async listEvents(scope: FiscalPersistenceScope, documentId: string, request: FiscalDocumentPageRequest): Promise<FiscalDocumentEventPage> {
    const normalized = fiscalDocumentPageRequest(request);
    const { data, error } = await this.client.rpc("shared_fiscal_document_event_list", {
      p_tenant_id: scope.tenantId,
      p_organization_id: scope.organizationId,
      p_company_id: scope.companyId,
      p_document_id: documentId,
      p_limit: normalized.limit,
      p_cursor_recorded_at: normalized.cursor?.createdAt ?? null,
      p_cursor_id: normalized.cursor?.id ?? null,
    });
    if (error) throw persistenceFailure(error.message);
    const result = asRecord(data, "Fiscal document event listing returned an invalid page.");
    if (!Array.isArray(result.items)) {
      throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Fiscal document event listing omitted its items.");
    }
    const items = result.items.map((value) => {
      const row = asRecord(value, "Fiscal document event listing returned an invalid item.");
      return {
        id: required(row.id, "event id"),
        eventType: required(row.event_type, "event type"),
        idempotencyKey: required(row.idempotency_key, "event idempotency key"),
        payload: asRecord(row.payload, "Fiscal document event payload is invalid."),
        occurredAt: required(row.occurred_at, "event occurrence timestamp"),
        recordedAt: required(row.recorded_at, "event recording timestamp"),
      };
    });
    if (result.nextCursor === null) return { items, nextCursor: null };
    const nextCursor = asRecord(result.nextCursor, "Fiscal document event listing returned an invalid cursor.");
    return {
      items,
      nextCursor: {
        createdAt: required(nextCursor.recordedAt, "next event cursor timestamp"),
        id: required(nextCursor.id, "next event cursor id"),
      },
    };
  }

  /**
   * Persists a draft and its preparation event atomically.
   * @param input - Scoped document, authenticated actor, source, key, and occurrence instant.
   * @returns The persisted aggregate and whether an equivalent command already existed.
   * @throws {FiscalFailure} When scope, source, idempotency, or persistence constraints fail.
   */
  async persist(input: PersistFiscalDocumentInput): Promise<PersistFiscalDocumentResult> {
    const { data, error } = await this.client.rpc("shared_fiscal_document_persist_draft", {
      p_tenant_id: input.scope.tenantId,
      p_organization_id: input.scope.organizationId,
      p_company_id: input.scope.companyId,
      p_source_kind: input.source.kind,
      p_source_id: input.source.id,
      p_document_id: input.document.id,
      p_document_snapshot: JSON.parse(encodeFiscalDocument(input.document)) as Record<string, unknown>,
      p_idempotency_key: input.idempotencyKey,
      p_created_by: input.actorId,
      p_occurred_at: input.occurredAt,
    });
    if (error) throw persistenceFailure(error.message);
    const result = asRecord(data, "Fiscal document persistence returned an invalid result.");
    const row = asRecord(result.document, "Fiscal document persistence omitted its document.");
    if (typeof result.replayed !== "boolean") {
      throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Fiscal document persistence omitted its replay status.");
    }
    return {
      document: decodeFiscalDocument((row as StoredDocument).document_snapshot),
      replayed: result.replayed,
    };
  }

  /**
   * Records a provider command transition and immutable network attempt.
   * @param scope - Tenant, organization, and company that own the document.
   * @param attempt - Attempt result using a stable provider idempotency key.
   * @returns The exact persisted attempt.
   * @throws {FiscalFailure} When scope, command transition, or provider evidence conflicts.
   */
  async appendIssuanceAttempt(scope: FiscalPersistenceScope, attempt: FiscalIssuanceAttempt): Promise<FiscalIssuanceAttempt> {
    const normalized = fiscalIssuanceAttempt(attempt);
    if (normalized.issuedDocument !== null && normalized.issuedDocument.companyId !== scope.companyId) {
      throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Issued fiscal snapshot belongs to another company.");
    }
    const { data, error } = await this.client.rpc("shared_fiscal_document_record_issuance_attempt", {
      p_tenant_id: scope.tenantId,
      p_organization_id: scope.organizationId,
      p_company_id: scope.companyId,
      p_attempt_id: normalized.id,
      p_document_id: normalized.documentId,
      p_provider: normalized.provider,
      p_provider_idempotency_key: normalized.idempotencyKey,
      p_attempt_state: normalized.state,
      p_request_fingerprint: normalized.requestFingerprint,
      p_provider_reference: normalized.providerReference,
      p_failure_code: normalized.failureCode,
      p_issued_document_snapshot: normalized.issuedDocument === null ? null : JSON.parse(encodeFiscalDocument(normalized.issuedDocument)) as Record<string, unknown>,
      p_occurred_at: normalized.occurredAt,
    });
    if (error) throw persistenceFailure(error.message);
    const result = asRecord(data, "Fiscal issuance persistence returned an invalid result.");
    const row = asRecord(result.attempt, "Fiscal issuance persistence omitted its attempt.");
    return fiscalIssuanceAttempt({
      id: required(row.id, "attempt id"),
      documentId: required(row.document_id, "document id"),
      provider: required(row.provider, "provider"),
      idempotencyKey: required(row.idempotency_key, "idempotency key"),
      state: required(row.attempt_state, "attempt state") as FiscalIssuanceAttempt["state"],
      requestFingerprint: required(row.request_fingerprint, "request fingerprint"),
      providerReference: optional(row.provider_reference),
      failureCode: optional(row.failure_code),
      occurredAt: required(row.occurred_at, "occurrence time"),
      issuedDocument: normalized.issuedDocument,
    });
  }
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", message);
  }
  return value as Record<string, unknown>;
}

function required(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", `Fiscal persistence omitted ${name}.`);
  }
  return value;
}

function optional(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function persistenceFailure(message: string): FiscalFailure {
  const knownCode = /\b(FISCAL_[A-Z0-9_]+)\b/.exec(message)?.[1];
  const codes = new Set([
    "FISCAL_DOCUMENT_NOT_FOUND",
    "FISCAL_DOCUMENT_IDEMPOTENCY_CONFLICT",
    "FISCAL_DOCUMENT_SOURCE_CONFLICT",
    "FISCAL_DOCUMENT_IMMUTABLE",
    "FISCAL_DOCUMENT_OUTSIDE_COMPANY",
    "FISCAL_DOCUMENT_ACTOR_OUTSIDE_ORGANIZATION",
    "FISCAL_DOCUMENT_IDENTITY_IMMUTABLE",
    "FISCAL_DOCUMENT_TRANSITION_INVALID",
    "FISCAL_DOCUMENT_ALREADY_FINALIZED",
    "FISCAL_AUDIT_APPEND_ONLY",
    "FISCAL_ISSUANCE_ATTEMPT_INVALID",
    "FISCAL_ISSUANCE_ATTEMPT_ID_CONFLICT",
    "FISCAL_ISSUANCE_COMMAND_IDEMPOTENCY_CONFLICT",
    "FISCAL_ISSUANCE_COMMAND_TERMINAL",
    "FISCAL_ISSUANCE_COMMAND_IDENTITY_IMMUTABLE",
    "FISCAL_ISSUANCE_COMMAND_TRANSITION_INVALID",
    "FISCAL_ISSUANCE_SNAPSHOT_INVALID",
  ]);
  const code = knownCode !== undefined && codes.has(knownCode)
    ? knownCode as ConstructorParameters<typeof FiscalFailure>[0]
    : "FISCAL_DOCUMENT_INVALID";
  return new FiscalFailure(code, knownCode ?? "Fiscal persistence request failed.");
}
