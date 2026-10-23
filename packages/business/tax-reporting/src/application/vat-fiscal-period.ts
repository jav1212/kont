import { TaxReportingFailure } from "../domain/tax-reporting-failure";
import { transitionVatFiscalPeriod, type VatFiscalPeriodRepository, type VatFiscalPeriodTransition } from "../domain";
import type { TaxReportingScope } from "../domain/tax-reporting-fact";

/** Reads a fiscal period by its complete company scope and key. */
export class GetVatFiscalPeriod {
  /**
   * Creates the period reader.
   * @param periods - Repository that validates company and actor scope.
   * @returns Fiscal-period read action.
   */
  constructor(private readonly periods: VatFiscalPeriodRepository) {}
  /**
   * Reads one period, including missing-periodicity pending state.
   * @param input - Company scope, period key, and actor identity.
   * @returns Fiscal-period snapshot or null when the key has no persisted state or profile.
   * @throws {TaxReportingFailure} When the actor cannot access the company.
   */
  execute(input: { readonly scope: TaxReportingScope; readonly periodKey: string; readonly actorId: string }) {
    if (!input.actorId.trim() || !input.periodKey.trim()) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Fiscal period query is invalid.");
    return this.periods.get(input.scope, input.periodKey, input.actorId);
  }
}

/** Applies a domain-validated fiscal-period transition through an atomic repository command. */
export class ChangeVatFiscalPeriod {
  /**
   * Creates the transition action.
   * @param periods - Repository that persists with compare-and-swap and idempotency.
   * @returns Fiscal-period lifecycle command.
   */
  constructor(private readonly periods: VatFiscalPeriodRepository) {}
  /**
   * Validates and persists one lifecycle transition.
   * @param input - Company scope, period key, actor, and transition evidence.
   * @returns Saved period and idempotent replay result.
   * @throws {TaxReportingFailure} For invalid transitions, stale versions, or persistence conflicts.
   */
  async execute(input: { readonly scope: TaxReportingScope; readonly periodKey: string; readonly transition: VatFiscalPeriodTransition }): Promise<{ readonly period: NonNullable<Awaited<ReturnType<VatFiscalPeriodRepository["get"]>>>; readonly replayed: boolean }> {
    const current = await this.periods.get(input.scope, input.periodKey, input.transition.actorId);
    if (!current) throw new TaxReportingFailure("TAX_REPORTING_SCOPE", "Fiscal period is unavailable for this company.");
    const replay = current.events.some((event) => event.idempotencyKey === input.transition.idempotencyKey);
    if (!replay) transitionVatFiscalPeriod(current, input.transition);
    return this.periods.transition(current, input.transition);
  }
}
