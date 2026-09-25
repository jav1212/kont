import type {
  ExchangeRateSetDto,
  OperationalDefaultsDto,
  SalesDashboardDto,
  SalesPerformanceDimensionDto,
  SalesPerformanceReportDto,
} from "@kontave/client-contracts";
import type { DesktopResult } from "../../core/result";
export interface DesktopSalesDashboardSnapshot {
  readonly operationContext: OperationalDefaultsDto;
  readonly exchangeRates: ExchangeRateSetDto;
  readonly dashboard: SalesDashboardDto;
}
export interface DesktopSalesDashboardQuery {
  readonly from?: string;
  readonly to?: string;
  readonly granularity?: "day";
  readonly recentLimit?: number;
}
export type DesktopSalesDashboardResult =
  DesktopResult<DesktopSalesDashboardSnapshot>;
export interface DesktopSalesPerformanceReportQuery {
  readonly from: string;
  readonly to: string;
  readonly dimension: SalesPerformanceDimensionDto;
}
export type DesktopSalesPerformanceReportResult = DesktopResult<SalesPerformanceReportDto>;
export interface DesktopSalesApi {
  getDashboard(
    organizationId: string,
    companyId: string,
    query?: DesktopSalesDashboardQuery,
  ): Promise<DesktopSalesDashboardResult>;
  getPerformanceReport(
    organizationId: string,
    companyId: string,
    query: DesktopSalesPerformanceReportQuery,
  ): Promise<DesktopSalesPerformanceReportResult>;
}
