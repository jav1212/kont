import { TaxReportingFailure, taxReportingFact, type TaxReportingFact, type TaxReportingFactRepository } from "../domain";
/** Appends one normalized historical fact through the scoped idempotent port. */
export class PersistTaxReportingFact {
  /** @param repository - Append-only reporting persistence. */
  constructor(private readonly repository: TaxReportingFactRepository) {}
  /** @param input - Fact, authenticated actor, and stable command key. @returns Stored fact or replay. @throws {TaxReportingFailure} On scope or idempotency errors. */
  async execute(input: { readonly fact: TaxReportingFact; readonly actorId: string; readonly idempotencyKey: string }): Promise<{ readonly fact: TaxReportingFact; readonly replayed: boolean }> {
    const fact = taxReportingFact(input.fact);
    if (!input.actorId.trim() || !input.idempotencyKey.trim() || input.idempotencyKey.length > 128) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Actor and idempotency key are required.");
    return this.repository.persist({ fact, actorId: input.actorId.trim(), idempotencyKey: input.idempotencyKey.trim() });
  }
}
