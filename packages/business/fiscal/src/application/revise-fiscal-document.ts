import {
  FiscalFailure,
  type FiscalDocument,
  type FiscalDocumentRevisionRepository,
  type FiscalPersistenceScope,
  type ReviseFiscalDocumentResult,
} from "../domain";

/** Rebuilds the legal content of a source-owned fiscal draft. */
export interface FiscalDraftCandidateBuilder {
  /**
   * Rebuilds a legal draft and captures the commercial-row version used for its snapshot.
   * @param input - Authorized fiscal scope, source identity, actor, and command time.
   * @returns The replacement aggregate and the source version read with it.
   * @throws {@link FiscalFailure} When the source cannot produce a valid fiscal draft.
   */
  reconstruct(input: {
    readonly scope: FiscalPersistenceScope;
    readonly sourceId: string;
    readonly actorId: string;
    readonly occurredAt: string;
  }): Promise<{ readonly document: FiscalDocument; readonly sourceUpdatedAt: string }>;
}

/** Replaces an unissued draft through an optimistic, append-only persistence command. */
export class ReviseFiscalDocument {
  /**
   * Creates the draft-revision command.
   * @param documents - Revision-capable, scoped fiscal persistence.
   * @param candidates - Source-specific legal reconstruction.
   * @returns No value; the command is ready to execute.
   * @throws No expected construction failure.
   */
  constructor(
    private readonly documents: FiscalDocumentRevisionRepository,
    private readonly candidates: FiscalDraftCandidateBuilder,
  ) {}

  /**
   * Reconstructs and atomically persists a replacement for an existing draft.
   * @param input Scope, revision precondition, explanation, identity, and time.
   * @returns The replacement snapshot and durable revision number.
   * @throws {FiscalFailure} When the draft cannot legally be revised.
   */
  async execute(input: {
    readonly scope: FiscalPersistenceScope;
    readonly documentId: string;
    readonly expectedRevision: number;
    readonly reason: string;
    readonly idempotencyKey: string;
    readonly actorId: string;
    readonly occurredAt: string;
  }): Promise<ReviseFiscalDocumentResult> {
    const reason = input.reason.trim();
    const idempotencyKey = input.idempotencyKey.trim();
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1 || input.expectedRevision > 2_147_483_647
      || reason.length < 1 || reason.length > 500 || idempotencyKey.length < 1 || idempotencyKey.length > 128
      || !input.actorId.trim()) {
      throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Los datos de revisión fiscal son inválidos.");
    }
    const metadata = await this.documents.findMetadata(input.scope, input.documentId);
    if (!metadata) throw new FiscalFailure("FISCAL_DOCUMENT_NOT_FOUND", "El documento fiscal no existe.");
    if (metadata.source.kind !== "legacy_sales_invoice") {
      throw new FiscalFailure("FISCAL_DOCUMENT_SOURCE_CONFLICT", "El origen del documento fiscal no admite revisión.");
    }
    // The storage command owns the CAS and replay order. Do not reject a stale
    // expected revision here because the same idempotency key may be replaying.
    const candidate = await this.candidates.reconstruct({
      scope: input.scope, sourceId: metadata.source.id, actorId: input.actorId, occurredAt: input.occurredAt,
    });
    if (candidate.document.id !== input.documentId || !candidate.sourceUpdatedAt.trim()) {
      throw new FiscalFailure("FISCAL_DOCUMENT_SOURCE_CONFLICT", "La fuente reconstruida no corresponde al documento fiscal.");
    }
    return this.documents.revise({ ...input, reason, idempotencyKey, replacement: candidate.document, expectedSourceUpdatedAt: candidate.sourceUpdatedAt });
  }
}
