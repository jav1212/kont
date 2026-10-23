import type { TaxReportingScope } from "../domain/tax-reporting-fact";

/** Exact amount serialized without conversion or cross-currency aggregation. */
export interface VatPeriodMoney { readonly minorAmount: string; readonly currency: { readonly code: string; readonly minorUnit: number }; }
/** Period totals grouped by source direction and reported measure. */
export interface VatPeriodSummary {
  readonly period: string;
  readonly periodicity: "monthly" | "fortnightly" | null;
  readonly totals: readonly { readonly direction: "purchase" | "sale" | "import"; readonly kind: "tax" | "credit" | "credit_pending" | "withholding_practiced" | "withholding_suffered" | "withholding_none"; readonly amount: VatPeriodMoney }[];
  readonly rateTotals: readonly { readonly direction: "purchase" | "sale" | "import"; readonly component: string | null; readonly category: string; readonly rate: string; readonly taxableBase: VatPeriodMoney; readonly taxAmount: VatPeriodMoney }[];
  readonly reconciliationCounts: { readonly reconciled: number; readonly issue: number };
  readonly factCounts: { readonly purchase: number; readonly sale: number; readonly import: number };
  readonly legacyUnincorporated: { readonly purchases: number; readonly sales: number };
}
/** Query boundary that returns complete period totals for permitted books. */
export interface VatPeriodSummaryReader {
  /**
   * Reads a complete period summary without mixing currencies or source permissions.
   * @param input - Company scope, actor, month, and permitted directions.
   * @returns Exact grouped totals and source counts.
   * @throws {Error} When the actor or period is outside the authorized scope.
   */
  read(input: { readonly scope: TaxReportingScope; readonly actorId: string; readonly period: string; readonly includePurchases: boolean; readonly includeSales: boolean }): Promise<VatPeriodSummary>;
}

/**
 * Loads a complete period summary from its scoped reader.
 * @param reader - Persistence port that revalidates actor and company scope.
 * @returns Use case for period summary reads.
 */
export class GetVatPeriodSummary {
  constructor(private readonly reader: VatPeriodSummaryReader) {}
  /**
   * Executes the period summary query.
   * @param input - Requested fiscal period, scope, actor, and visible books.
   * @returns Summary grouped by currency and historical tax dimensions.
   * @throws {Error} When no book is visible or the period is invalid.
   */
  execute(input: { readonly scope: TaxReportingScope; readonly actorId: string; readonly period: string; readonly includePurchases: boolean; readonly includeSales: boolean }): Promise<VatPeriodSummary> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period) || !input.actorId.trim() || (!input.includePurchases && !input.includeSales)) throw new Error("Invalid IVA period summary request.");
    return this.reader.read(input);
  }
}
