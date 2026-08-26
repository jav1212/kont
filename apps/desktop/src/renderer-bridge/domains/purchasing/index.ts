import type {
  ExchangeRateSetDto,
  OperationalDefaultsDto,
  PurchasingDashboardDto,
} from "@kontave/client-contracts";
import type { DesktopResult } from "../../core/result";
export interface DesktopPurchasingDashboardSnapshot {
  readonly operationContext: OperationalDefaultsDto;
  readonly exchangeRates: ExchangeRateSetDto;
  readonly dashboard: PurchasingDashboardDto;
}
export interface DesktopPurchasingDashboardQuery {
  readonly from?: string;
  readonly to?: string;
  readonly recentLimit?: number;
}
export type DesktopPurchasingDashboardResult =
  DesktopResult<DesktopPurchasingDashboardSnapshot>;
export interface DesktopPurchasingApi {
  getDashboard(
    userId: string,
    organizationId: string,
    companyId: string,
    query?: DesktopPurchasingDashboardQuery,
  ): Promise<DesktopPurchasingDashboardResult>;
}
