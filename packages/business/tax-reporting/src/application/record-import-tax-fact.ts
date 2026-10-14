import { TaxReportingFailure, taxReportingFact, type TaxReportingFact, type TaxReportingFactRepository } from "../domain";

/** Records a reviewed goods or foreign-service import snapshot without deriving its tax treatment. */
export class RecordImportTaxFact {
  /**
   * Creates the import recording command.
   * @param repository - Append-only, scope-checked tax-reporting persistence.
   * @returns A command that validates import evidence before appending the fact.
   * @throws {TaxReportingFailure} When the repository dependency is unavailable.
   */
  constructor(private readonly repository: TaxReportingFactRepository) {
    if (!repository) throw new TaxReportingFailure("TAX_REPORTING_UNAVAILABLE", "Import fact persistence is unavailable.");
  }

  /**
   * Validates and appends one imported-goods or foreign-service fact.
   * @param input - Historical fact snapshot, authenticated actor, and stable idempotency key.
   * @returns The stored fact and whether persistence replayed an earlier command.
   * @throws {TaxReportingFailure} When evidence is incomplete, the fact is not an import, or persistence rejects it.
   */
  async execute(input: { readonly fact: TaxReportingFact; readonly actorId: string; readonly idempotencyKey: string }): Promise<{ readonly fact: TaxReportingFact; readonly replayed: boolean }> {
    const fact = taxReportingFact(input.fact);
    if (fact.direction !== "import" || (fact.documentKind !== "import_declaration" && fact.documentKind !== "foreign_service_assessment")) {
      throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Import recording accepts only goods declarations or foreign-service assessments.");
    }
    if (!input.actorId.trim() || !input.idempotencyKey.trim() || input.idempotencyKey.length > 128) {
      throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Actor and idempotency key are required.");
    }
    return this.repository.persist({ fact, actorId: input.actorId.trim(), idempotencyKey: input.idempotencyKey.trim() });
  }
}
