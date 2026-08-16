import type { CompanyId, OrganizationId, UserId } from "@kontave/organizations-domain";

export interface SalesDashboardQuery {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly from: string;
  readonly to: string;
  readonly granularity: "day";
  readonly recentLimit: number;
}
export interface SalesDashboardAmount { readonly amount: string; readonly currency: "VES" }
export interface SalesDashboardSummary {
  readonly confirmedInvoicedAmount: SalesDashboardAmount;
  readonly taxableBaseAmount: SalesDashboardAmount;
  readonly vatDebitAmount: SalesDashboardAmount;
  readonly confirmedInvoiceCount: number;
  readonly draftInvoiceCount: number;
  readonly averageTicketAmount: SalesDashboardAmount;
}
export interface SalesDashboardDailyPoint {
  readonly date: string;
  readonly confirmedInvoicedAmount: SalesDashboardAmount;
  readonly taxableBaseAmount: SalesDashboardAmount;
  readonly vatDebitAmount: SalesDashboardAmount;
  readonly confirmedInvoiceCount: number;
}
export interface SalesDashboardDocument {
  readonly id: string;
  readonly sourceKind: "legacy_sales_invoice";
  readonly documentType: "invoice";
  readonly invoiceNumber: string;
  readonly customerName: string | null;
  readonly date: string;
  readonly status: "confirmed" | "draft";
  readonly salesChannel: "administrative" | "pos";
  readonly subtotal: SalesDashboardAmount;
  readonly taxableBase: SalesDashboardAmount;
  readonly vatAmount: SalesDashboardAmount;
  readonly total: SalesDashboardAmount;
  readonly transactionCurrency: string;
  readonly sourceSubtotal: string | null;
  readonly sourceVatAmount: string | null;
  readonly sourceTotal: string | null;
}
export interface SalesDashboardSnapshot {
  readonly period: { readonly from: string; readonly to: string; readonly granularity: "day" };
  readonly summary: SalesDashboardSummary;
  readonly charts: readonly SalesDashboardDailyPoint[];
  readonly recentConfirmedInvoices: readonly SalesDashboardDocument[];
  readonly recentDraftInvoices: readonly SalesDashboardDocument[];
  readonly generatedAt: string;
}
export interface SalesDashboardReader { read(query: SalesDashboardQuery): Promise<SalesDashboardSnapshot> }
export type SalesDashboardFailureCode = "SALES_DASHBOARD_INVALID" | "SALES_DASHBOARD_ACCESS_DENIED" | "SALES_DASHBOARD_UNAVAILABLE";
export class SalesDashboardFailure extends Error {
  constructor(readonly code: SalesDashboardFailureCode, message: string, options?: ErrorOptions) { super(message, options); this.name = "SalesDashboardFailure"; }
}
export class GetSalesDashboard {
  constructor(private readonly reader: SalesDashboardReader) {}
  execute(query: SalesDashboardQuery): Promise<SalesDashboardSnapshot> { return this.reader.read(validateSalesDashboardQuery(query)); }
}
export function validateSalesDashboardQuery(query: SalesDashboardQuery): SalesDashboardQuery {
  const from = validDate(query.from), to = validDate(query.to);
  if (from > to) throw invalid("Dashboard start date must not be after its end date.");
  const inclusiveDays = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (inclusiveDays > 366) throw invalid("Dashboard periods cannot exceed 366 days.");
  if (query.granularity !== "day") throw invalid("Only day granularity is currently supported.");
  if (!Number.isSafeInteger(query.recentLimit) || query.recentLimit < 1 || query.recentLimit > 100) throw invalid("Recent-document limit must be between 1 and 100.");
  return Object.freeze({ ...query, from, to });
}
function validDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid("Dashboard dates must use YYYY-MM-DD format.");
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw invalid("Dashboard date is invalid.");
  return value;
}
function invalid(message: string): SalesDashboardFailure { return new SalesDashboardFailure("SALES_DASHBOARD_INVALID", message); }
