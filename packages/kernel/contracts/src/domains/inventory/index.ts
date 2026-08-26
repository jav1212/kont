import type { UnitOfMeasure } from "../products/dtos";

export interface InventoryDashboardQuery {
  readonly from: string;
  readonly to: string;
  readonly granularity?: "day";
  readonly limit?: number;
}

export interface InventoryFlowQuery {
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

export interface InventoryAmountDto {
  readonly amount: string;
  readonly currency: "VES";
}
export interface InventoryUnitFlowDto {
  readonly unit: string;
  readonly inbound: string;
  readonly outbound: string;
}
export interface InventoryDashboardSummaryDto {
  readonly inboundValue: InventoryAmountDto;
  readonly outboundValue: InventoryAmountDto;
  readonly movementCount: number;
  readonly inventoryValue: InventoryAmountDto;
  readonly quantities: readonly InventoryUnitFlowDto[];
  readonly valuationDate: string;
}
export interface InventoryDashboardChartPointDto {
  readonly date: string;
  readonly inboundValue: InventoryAmountDto;
  readonly outboundValue: InventoryAmountDto;
  readonly movementCount: number;
  readonly quantities: readonly InventoryUnitFlowDto[];
}
export interface RecentInventoryDocumentDto {
  readonly id: string;
  readonly recordType:
    | "invoice"
    | "delivery_note"
    | "debit_note"
    | "credit_note"
    | "other";
  readonly number: string;
  readonly counterparty: string | null;
  readonly date: string;
  readonly status: string;
  readonly total: InventoryAmountDto;
  readonly transactionCurrency: string;
  readonly sourceTotal: string | null;
}
export interface RecentInventoryMovementDto {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSku: string;
  readonly effectiveDate: string;
  readonly movementType: string;
  readonly direction: "inbound" | "outbound";
  readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
  readonly totalCost: InventoryAmountDto;
  readonly reference: string | null;
}
export interface InventoryDashboardDto {
  readonly period: {
    readonly from: string;
    readonly to: string;
    readonly granularity: "day";
  };
  readonly summary: InventoryDashboardSummaryDto;
  readonly charts: readonly InventoryDashboardChartPointDto[];
  readonly recentSales: readonly RecentInventoryDocumentDto[];
  readonly recentPurchases: readonly RecentInventoryDocumentDto[];
  readonly recentInboundMovements: readonly RecentInventoryMovementDto[];
  readonly recentOutboundMovements: readonly RecentInventoryMovementDto[];
  readonly generatedAt: string;
}

export type InventoryOperationReason =
  | "opening_balance"
  | "purchase_receipt"
  | "sales_issue"
  | "customer_return"
  | "supplier_return"
  | "transfer"
  | "stock_count_adjustment"
  | "self_consumption"
  | "production_consumption"
  | "production_output"
  | "reversal";
export type InventoryOperationStatus = "draft" | "posted" | "reversed";
export type InventoryOperationSourceKind =
  | "purchasing"
  | "sales"
  | "inventory"
  | "production"
  | "migration";
export interface InventoryFlowItemDto {
  readonly id: string;
  readonly operationId: string;
  readonly effectiveDate: string;
  readonly direction: "inbound" | "outbound";
  readonly reason: InventoryOperationReason;
  readonly status: InventoryOperationStatus;
  readonly product: {
    readonly id: string;
    readonly sku: string;
    readonly name: string;
  };
  readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
  readonly unitCost: InventoryAmountDto | null;
  readonly totalCost: InventoryAmountDto | null;
  readonly source: {
    readonly kind: InventoryOperationSourceKind;
    readonly documentId: string;
  };
  readonly reference: string | null;
  readonly notes: string | null;
  readonly postedAt: string | null;
}
export interface InventoryFlowPageDto {
  readonly items: readonly InventoryFlowItemDto[];
  readonly nextCursor: string | null;
  readonly total: number;
  readonly summary: {
    readonly movementCount: number;
    readonly totalValue: InventoryAmountDto;
    readonly quantities: readonly {
      readonly unit: UnitOfMeasure;
      readonly value: string;
    }[];
  };
}
export interface InventoryOperationDetailDto {
  readonly id: string;
  readonly companyId: string;
  readonly reason: InventoryOperationReason;
  readonly effectiveDate: string;
  readonly status: InventoryOperationStatus;
  readonly version: number;
  readonly source: {
    readonly kind: InventoryOperationSourceKind;
    readonly documentId: string;
  };
  readonly reference: string | null;
  readonly notes: string | null;
  readonly postedAt: string | null;
  readonly reversalOf: string | null;
  readonly reversedBy: string | null;
  readonly lines: readonly {
    readonly id: string;
    readonly productId: string;
    readonly productName: string;
    readonly productSku: string;
    readonly direction: "inbound" | "outbound";
    readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
    readonly unitCost: InventoryAmountDto | null;
    readonly movementId: string | null;
  }[];
  readonly capabilities: {
    readonly canPost: boolean;
    readonly canReverse: boolean;
    readonly canEditMetadata: boolean;
  };
}
export interface CreateInventoryOperationDto {
  readonly reason:
    | "opening_balance"
    | "stock_count_adjustment"
    | "self_consumption";
  readonly effectiveDate: string;
  readonly reference?: string | null;
  readonly notes?: string | null;
  readonly lines: readonly {
    readonly productId: string;
    readonly direction: "inbound" | "outbound";
    readonly quantity: string;
    readonly unit: UnitOfMeasure;
    readonly unitCost?: string | null;
  }[];
}
export interface InventoryOperationVersionDto {
  readonly expectedVersion: number;
}
export interface UpdateInventoryOperationDto
  extends InventoryOperationVersionDto {
  readonly effectiveDate?: string;
  readonly reference?: string | null;
  readonly notes?: string | null;
}
export interface ReverseInventoryOperationDto
  extends InventoryOperationVersionDto {
  readonly effectiveDate: string;
  readonly reason: string;
}

/** Application-facing port for inventory dashboards and operations. */
export interface InventoryPort {
  /** @param organizationId - Owning organization. @param companyId - Operational company. @param query - Dashboard query. @returns Inventory dashboard. */
  dashboard(
    organizationId: string,
    companyId: string,
    query: InventoryDashboardQuery,
  ): Promise<InventoryDashboardDto>;
  /** @param organizationId - Owning organization. @param companyId - Operational company. @param query - Flow query. @returns Inbound flow. */
  entries(
    organizationId: string,
    companyId: string,
    query: InventoryFlowQuery,
  ): Promise<InventoryFlowPageDto>;
  /** @param organizationId - Owning organization. @param companyId - Operational company. @param query - Flow query. @returns Outbound flow. */
  outputs(
    organizationId: string,
    companyId: string,
    query: InventoryFlowQuery,
  ): Promise<InventoryFlowPageDto>;
  /** @param organizationId - Owning organization. @param companyId - Operational company. @param query - Operation query. @returns Manual operations. */
  operations(
    organizationId: string,
    companyId: string,
    query: InventoryFlowQuery,
  ): Promise<InventoryFlowPageDto>;
  /** @param organizationId - Owning organization. @param companyId - Operational company. @param operationId - Operation identifier. @returns Operation detail. */
  operation(
    organizationId: string,
    companyId: string,
    operationId: string,
  ): Promise<InventoryOperationDetailDto>;
  /** @param organizationId - Owning organization. @param companyId - Operational company. @param command - Creation command. @returns Created operation. */
  create(
    organizationId: string,
    companyId: string,
    command: CreateInventoryOperationDto,
  ): Promise<InventoryOperationDetailDto>;
  /** @param organizationId - Owning organization. @param companyId - Operational company. @param operationId - Operation identifier. @param command - Update command. @returns Updated operation. */
  update(
    organizationId: string,
    companyId: string,
    operationId: string,
    command: UpdateInventoryOperationDto,
  ): Promise<InventoryOperationDetailDto>;
  /** @param organizationId - Owning organization. @param companyId - Operational company. @param operationId - Operation identifier. @param expectedVersion - Required version. @returns Posted operation. */
  post(
    organizationId: string,
    companyId: string,
    operationId: string,
    expectedVersion: number,
  ): Promise<InventoryOperationDetailDto>;
  /** @param organizationId - Owning organization. @param companyId - Operational company. @param operationId - Operation identifier. @param command - Reversal command. @returns Reversed operation. */
  reverse(
    organizationId: string,
    companyId: string,
    operationId: string,
    command: ReverseInventoryOperationDto,
  ): Promise<InventoryOperationDetailDto>;
}
