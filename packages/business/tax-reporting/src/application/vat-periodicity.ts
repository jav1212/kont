import { TaxReportingFailure } from "../domain/tax-reporting-failure";
import { validateVatPeriodicityChange, type ConfigureVatPeriodicityCommand, type VatPeriodicityRepository, type VatPeriodicitySetting } from "../domain/vat-periodicity";
import type { VatFiscalPeriodicity } from "../domain/vat-fiscal-period";
import type { TaxReportingScope } from "../domain/tax-reporting-fact";

/** Reads a company's configured VAT periodicity and its audit trail. */
export class GetVatPeriodicity {
  /**
   * Creates the periodicity reader.
   * @param settings - Repository that enforces company and permission scope.
   * @returns Periodicity read action.
   */
  constructor(private readonly settings: VatPeriodicityRepository) {}
  /**
   * Reads the current setting without inferring a value when none is configured.
   * @param input - Company scope and authenticated actor.
   * @returns Current periodicity, persisted-period count, and recent changes.
   * @throws {TaxReportingFailure} When the actor is missing or cannot read the company.
   */
  async execute(input: { readonly scope: TaxReportingScope; readonly actorId: string }): Promise<VatPeriodicitySetting> {
    if (!input.actorId.trim()) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "VAT periodicity query is invalid.");
    return this.settings.get(input.scope, input.actorId);
  }
}

/** Configures or changes a company's VAT periodicity through an audited command. */
export class ConfigureVatPeriodicity {
  /**
   * Creates the periodicity command.
   * @param settings - Repository that persists with compare-and-swap and idempotency.
   * @returns Periodicity configuration action.
   */
  constructor(private readonly settings: VatPeriodicityRepository) {}
  /**
   * Validates and persists one periodicity change.
   * @param input - Company scope and the explicit change requested by an authorized operator.
   * @returns Saved periodicity and idempotent replay result.
   * @throws {TaxReportingFailure} For invalid commands, stale expectations, reused keys, or periods that lock the setting.
   */
  async execute(input: { readonly scope: TaxReportingScope; readonly command: ConfigureVatPeriodicityCommand }): Promise<{ readonly periodicity: VatFiscalPeriodicity; readonly replayed: boolean }> {
    return this.settings.set(input.scope, validateVatPeriodicityChange(input.command));
  }
}
