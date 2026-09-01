import type {
  CreateInventoryOperationDto,
  ExchangeRateSetDto,
  InventoryDashboardDto,
  InventoryFlowPageDto,
  InventoryOperationDetailDto,
  OperationalDefaultsDto,
  ReverseInventoryOperationDto,
  UpdateInventoryOperationDto,
} from "@kontave/client-contracts";
import type { DesktopResult } from "../../core/result";

export interface DesktopInventoryDashboardSnapshot {
  readonly operationContext: OperationalDefaultsDto;
  readonly exchangeRates: ExchangeRateSetDto;
  readonly dashboard: InventoryDashboardDto;
}
export interface DesktopInventoryDashboardQuery {
  readonly from?: string;
  readonly to?: string;
}
export type DesktopInventoryDashboardResult =
  DesktopResult<DesktopInventoryDashboardSnapshot>;
export interface DesktopInventoryFlowQuery {
  readonly from: string;
  readonly to: string;
  readonly reason?: string;
  readonly sourceKind?: string;
  readonly productId?: string;
  readonly status?: "draft" | "posted" | "reversed";
  readonly search?: string;
  readonly cursor?: string;
  readonly limit?: number;
}
export type DesktopInventoryResult<T> = DesktopResult<T>;

/** Inventory capability exposed by preload. */
export interface DesktopInventoryApi {
  getDashboard(
    organizationId: string,
    companyId: string,
    query?: DesktopInventoryDashboardQuery,
  ): Promise<DesktopInventoryDashboardResult>;
  entries(
    organizationId: string,
    companyId: string,
    query: DesktopInventoryFlowQuery,
  ): Promise<DesktopInventoryResult<InventoryFlowPageDto>>;
  outputs(
    organizationId: string,
    companyId: string,
    query: DesktopInventoryFlowQuery,
  ): Promise<DesktopInventoryResult<InventoryFlowPageDto>>;
  operations(
    organizationId: string,
    companyId: string,
    query: DesktopInventoryFlowQuery,
  ): Promise<DesktopInventoryResult<InventoryFlowPageDto>>;
  operation(
    organizationId: string,
    companyId: string,
    operationId: string,
  ): Promise<DesktopInventoryResult<InventoryOperationDetailDto>>;
  createOperation(
    organizationId: string,
    companyId: string,
    command: CreateInventoryOperationDto,
  ): Promise<DesktopInventoryResult<InventoryOperationDetailDto>>;
  updateOperation(
    organizationId: string,
    companyId: string,
    operationId: string,
    command: UpdateInventoryOperationDto,
  ): Promise<DesktopInventoryResult<InventoryOperationDetailDto>>;
  postOperation(
    organizationId: string,
    companyId: string,
    operationId: string,
    expectedVersion: number,
  ): Promise<DesktopInventoryResult<InventoryOperationDetailDto>>;
  reverseOperation(
    organizationId: string,
    companyId: string,
    operationId: string,
    command: ReverseInventoryOperationDto,
  ): Promise<DesktopInventoryResult<InventoryOperationDetailDto>>;
}
