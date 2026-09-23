import {
  FiscalFailure,
  fiscalInstant,
  type FiscalDocumentRepository,
  type PersistFiscalDocumentInput,
  type PersistFiscalDocumentResult,
} from "../domain";

/** Coordinates validation and durable storage of an outbound fiscal draft. */
export class PrepareFiscalDocument {
  /**
   * Creates the preparation service.
   * @param documents - Transactional fiscal-document repository.
   */
  constructor(private readonly documents: FiscalDocumentRepository) {}

  /**
   * Persists an outbound draft with its preparation event in one transaction.
   * @param input - Fiscal snapshot, source, idempotency key, scope, and occurrence instant.
   * @returns The persisted document and whether the request replayed a prior command.
   * @throws {@link FiscalFailure} When scope, lifecycle, or persistence invariants fail.
   */
  async execute(input: PersistFiscalDocumentInput): Promise<PersistFiscalDocumentResult> {
    if (
      input.document.companyId !== input.scope.companyId ||
      input.document.direction !== "issued" ||
      input.document.status !== "draft"
    ) {
      throw new FiscalFailure(
        "FISCAL_DOCUMENT_INVALID",
        "Only an outbound draft for the scoped company can be prepared.",
      );
    }

    requireText(input.source.kind, "source kind");
    requireText(input.source.id, "source identity");
    requireText(input.idempotencyKey, "idempotency key");
    if (input.actorId !== null) requireText(input.actorId, "actor identity");
    fiscalInstant(input.occurredAt);

    return this.documents.persist(input);
  }
}

function requireText(value: string, name: string): void {
  if (value.trim().length === 0 || value.trim().length > 256) {
    throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", `Fiscal ${name} is invalid.`);
  }
}
