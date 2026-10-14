import type { FiscalDocument, FiscalIssuanceAttempt } from "@kontave/fiscal/domain";
import { TaxReportingFailure, type TaxReportingFact, type TaxReportingFactRepository, type TaxReportingScope } from "../domain";
import { fiscalDocumentTaxFact, type FiscalDocumentFactMetadata } from "./fiscal-document-fact";

/** Records a finalized fiscal document as an idempotent historical VAT fact. */
export class RecordFiscalDocumentTaxFact {
  /**
   * Creates the command that snapshots a fiscal document into the tax ledger.
   * @param facts - Append-only historical fact repository.
   * @returns Command for an issued or received fiscal document.
   * @throws No expected failure during construction.
   */
  constructor(private readonly facts: TaxReportingFactRepository) {}

  /**
   * Maps the saved fiscal tax determinations and appends their historical fact.
   *
   * The idempotency key is stable for a source-document posting operation. A
   * retry returns the original fact rather than calculating tax or creating a
   * second book entry.
   *
   * @param input - Final fiscal document, authorized scope, explicit review metadata, and command identity.
   * @returns The stored historical fact and replay indicator.
   * @throws {TaxReportingFailure} When source data, review metadata, actor, or idempotency is invalid.
   */
  async execute(input: {
    readonly document: FiscalDocument;
    readonly scope: TaxReportingScope;
    readonly metadata: FiscalDocumentFactMetadata;
    readonly actorId: string;
    readonly idempotencyKey: string;
  }): Promise<{ readonly fact: TaxReportingFact; readonly replayed: boolean }> {
    if (!input.actorId.trim() || !input.idempotencyKey.trim() || input.idempotencyKey.length > 128) {
      throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Actor and idempotency key are required to record a fiscal fact.");
    }
    const fact = fiscalDocumentTaxFact(input.document, input.scope, input.metadata);
    return this.facts.persist({ fact, actorId: input.actorId.trim(), idempotencyKey: input.idempotencyKey.trim() });
  }
}

/** Atomic persistence boundary for an accepted fiscal issuance and its VAT ledger fact. */
export interface IssuedFiscalDocumentTaxFactRepository {
  /**
   * Persists provider acceptance and its reporting fact in one database transaction.
   * @param input - Issuance attempt, immutable fact, actor, and stable reporting command key.
   * @returns The stored fact and whether reporting persistence replayed an earlier command.
   * @throws {TaxReportingFailure} If either the issuance or fact cannot be persisted consistently.
   */
  persistIssued(input: {
    readonly attempt: FiscalIssuanceAttempt;
    readonly fact: TaxReportingFact;
    readonly actorId: string;
    readonly idempotencyKey: string;
  }): Promise<{ readonly fact: TaxReportingFact; readonly replayed: boolean }>;
}

/** Records an accepted fiscal issuance together with the corresponding historical IVA fact. */
export class RecordIssuedFiscalDocumentTaxFact {
  /**
   * Creates the atomic issuance-and-ledger command.
   * @param repository - Transactional persistence port implemented by the reporting adapter.
   * @returns Command for accepted fiscal issuance evidence.
   * @throws No expected failure during construction.
   */
  constructor(private readonly repository: IssuedFiscalDocumentTaxFactRepository) {}

  /**
   * Maps the accepted document snapshot and commits it with the reporting fact.
   * @param input - Issuance attempt, reporting metadata, actor, and stable idempotency key.
   * @returns The saved fact and replay indicator.
   * @throws {TaxReportingFailure} If the attempt is not accepted or snapshot mapping fails.
   */
  async execute(input: {
    readonly attempt: FiscalIssuanceAttempt;
    readonly scope: TaxReportingScope;
    readonly metadata: FiscalDocumentFactMetadata;
    readonly actorId: string;
    readonly idempotencyKey: string;
  }): Promise<{ readonly fact: TaxReportingFact; readonly replayed: boolean }> {
    if (input.attempt.state !== "accepted" || input.attempt.issuedDocument === null) {
      throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Only an accepted fiscal issuance can be recorded with a VAT fact.");
    }
    if (!input.actorId.trim() || !input.idempotencyKey.trim() || input.idempotencyKey.length > 128) {
      throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Actor and idempotency key are required to record an issued fiscal fact.");
    }
    const fact = fiscalDocumentTaxFact(input.attempt.issuedDocument, input.scope, input.metadata);
    if (fact.source.id !== input.attempt.documentId) {
      throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Issued document and reporting fact identities do not match.");
    }
    return this.repository.persistIssued({
      attempt: input.attempt,
      fact,
      actorId: input.actorId.trim(),
      idempotencyKey: input.idempotencyKey.trim(),
    });
  }
}
