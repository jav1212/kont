export interface PurchasingAmountDto {
  readonly amount: string;
  readonly currency: "VES";
}
export interface PurchasingTransactionAmountDto {
  readonly amount: string;
  readonly currency: string;
}
export interface PurchasingSupplierDto {
  readonly id: string | null;
  readonly legalName: string;
  readonly taxIdentifier: string | null;
}
export interface PurchasingDashboardSummaryDto {
  readonly confirmedPurchaseTotal: PurchasingAmountDto;
  readonly vatCreditTotal: PurchasingAmountDto;
  readonly vatWithheldTotal: PurchasingAmountDto;
  readonly confirmedDocumentCount: number;
  readonly draftDocumentCount: number;
}
export interface PurchasingDashboardDayDto {
  readonly date: string;
  readonly confirmedPurchaseTotal: PurchasingAmountDto;
  readonly vatCreditTotal: PurchasingAmountDto;
  readonly confirmedDocumentCount: number;
  readonly draftDocumentCount: number;
}
export interface PurchasingTopSupplierDto {
  readonly supplier: PurchasingSupplierDto;
  readonly confirmedPurchaseTotal: PurchasingAmountDto;
  readonly confirmedDocumentCount: number;
}
export interface RecentPurchasingDocumentDto {
  readonly id: string;
  readonly documentType: "invoice" | "credit_note" | "debit_note";
  readonly invoiceNumber: string;
  readonly controlNumber: string | null;
  readonly supplier: PurchasingSupplierDto;
  readonly fiscalDate: string;
  readonly status: "draft" | "confirmed";
  readonly functionalAmounts: {
    readonly subtotal: PurchasingAmountDto;
    readonly vat: PurchasingAmountDto;
    readonly vatWithheld: PurchasingAmountDto;
    readonly total: PurchasingAmountDto;
  };
  readonly transactionCurrency: string;
  readonly transactionAmounts: {
    readonly subtotal: PurchasingTransactionAmountDto | null;
    readonly vat: PurchasingTransactionAmountDto | null;
    readonly total: PurchasingTransactionAmountDto | null;
  };
}
export interface PurchasingDashboardDto {
  readonly period: {
    readonly from: string;
    readonly to: string;
    readonly granularity: "day";
  };
  readonly summary: PurchasingDashboardSummaryDto;
  readonly daily: readonly PurchasingDashboardDayDto[];
  readonly topSuppliers: readonly PurchasingTopSupplierDto[];
  readonly recentDocuments: readonly RecentPurchasingDocumentDto[];
  readonly generatedAt: string;
}

export interface PurchasingDashboardQuery {
  readonly from: string;
  readonly to: string;
  readonly granularity?: "day";
  readonly limit?: number;
}

/** Application-facing port for purchasing read models. */
export interface PurchasingPort {
  /** @param organizationId - Owning organization. @param companyId - Operational company. @param query - Dashboard query. @returns Purchasing dashboard. */
  dashboard(organizationId: string, companyId: string, query: PurchasingDashboardQuery): Promise<PurchasingDashboardDto>;
}
