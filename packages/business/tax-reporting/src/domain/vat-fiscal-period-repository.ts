import type { TaxReportingScope } from "./tax-reporting-fact";
import type { VatFiscalPeriod, VatFiscalPeriodTransition } from "./vat-fiscal-period";
/** Persistence boundary for versioned company VAT fiscal periods. */
export interface VatFiscalPeriodRepository {
  /**
   * Reads a period by full fiscal identity.
   * @param scope - Tenant, organization, and company identity.
   * @param periodKey - Month or configured fortnight key.
   * @param actorId - Authenticated actor used for scope validation.
   * @returns Saved period, or null when it has not been created.
   * @throws {Error} When the actor cannot access the company.
   */
  get(scope: TaxReportingScope, periodKey: string, actorId: string): Promise<VatFiscalPeriod | null>;
  /**
   * Saves one transition atomically with idempotency and compare-and-swap.
   * @param period - Target immutable period snapshot.
   * @param transition - Command that produced the target state.
   * @returns Saved period and whether the request replayed.
   * @throws {Error} For scope, idempotency, or version conflicts.
   */
  transition(period: VatFiscalPeriod, transition: VatFiscalPeriodTransition): Promise<{ readonly period: VatFiscalPeriod; readonly replayed: boolean }>;
}
