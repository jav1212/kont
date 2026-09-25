export interface SalesAmountDto {
  readonly amount: string;
  readonly currency: "VES";
}
export interface SalesDashboardSummaryDto {
  readonly confirmedInvoicedAmount: SalesAmountDto;
  readonly taxableBaseAmount: SalesAmountDto;
  readonly vatDebitAmount: SalesAmountDto;
  readonly confirmedInvoiceCount: number;
  readonly draftInvoiceCount: number;
  readonly averageTicketAmount: SalesAmountDto;
}
export interface SalesDashboardDailyPointDto {
  readonly date: string;
  readonly confirmedInvoicedAmount: SalesAmountDto;
  readonly taxableBaseAmount: SalesAmountDto;
  readonly vatDebitAmount: SalesAmountDto;
  readonly confirmedInvoiceCount: number;
}
export interface SalesDashboardDocumentDto {
  readonly id: string;
  readonly sourceKind: "legacy_sales_invoice";
  readonly documentType: "invoice";
  readonly invoiceNumber: string;
  readonly customerName: string | null;
  readonly date: string;
  readonly status: "confirmed" | "draft";
  readonly salesChannel: "administrative" | "pos";
  readonly subtotal: SalesAmountDto;
  readonly taxableBase: SalesAmountDto;
  readonly vatAmount: SalesAmountDto;
  readonly total: SalesAmountDto;
  readonly transactionCurrency: string;
  readonly sourceSubtotal: string | null;
  readonly sourceVatAmount: string | null;
  readonly sourceTotal: string | null;
}
export interface SalesDashboardDto {
  readonly period: {
    readonly from: string;
    readonly to: string;
    readonly granularity: "day";
  };
  readonly summary: SalesDashboardSummaryDto;
  readonly charts: readonly SalesDashboardDailyPointDto[];
  readonly recentConfirmedInvoices: readonly SalesDashboardDocumentDto[];
  readonly recentDraftInvoices: readonly SalesDashboardDocumentDto[];
  readonly generatedAt: string;
}

export interface SalesDashboardQuery {
  readonly from: string;
  readonly to: string;
  readonly granularity?: "day";
  readonly limit?: number;
}

export type SalesPerformanceDimensionDto = "user" | "role" | "device";
export interface SalesPerformanceRowDto {
  readonly key: string;
  readonly label: string;
  readonly attributed: boolean;
  readonly invoiceCount: number;
  readonly grossAmount: SalesAmountDto;
}
export interface SalesPerformanceReportDto {
  readonly period: { readonly from: string; readonly to: string };
  readonly dimension: SalesPerformanceDimensionDto;
  readonly currency: "VES";
  readonly rows: readonly SalesPerformanceRowDto[];
  readonly generatedAt: string;
}
export interface SalesPerformanceReportQuery {
  readonly from: string;
  readonly to: string;
  readonly dimension: SalesPerformanceDimensionDto;
  readonly currency?: "VES";
}

/** Application-facing port for sales read models. */
export interface SalesPort {
  /** @param organizationId - Owning organization. @param companyId - Operational company. @param query - Dashboard query. @returns Sales dashboard. */
  dashboard(
    organizationId: string,
    companyId: string,
    query: SalesDashboardQuery,
  ): Promise<SalesDashboardDto>;

  /**
   * Reads sales grouped by the requested historical attribution dimension.
   * @param organizationId Owning organization.
   * @param companyId Operational company.
   * @param query Period and grouping dimension.
   * @returns Sales performance report with exact VES totals.
   * @throws KontaveRemoteFailure when authorization, transport, or response validation fails.
   */
  performanceReport(
    organizationId: string,
    companyId: string,
    query: SalesPerformanceReportQuery,
  ): Promise<SalesPerformanceReportDto>;
}
