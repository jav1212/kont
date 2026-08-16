import type { CompanyId, OrganizationId, UserId } from "@kontave/organizations-domain";
import type { CompanyId as CatalogCompanyId } from "@kontave/companies-domain";
import type { ReplenishmentPolicy } from "@kontave/inventory-domain";
import type { ProductId, UnitOfMeasure } from "@kontave/products-domain";

export * from "./inventory-operations";

export type InventoryDashboardGranularity = "day";
export interface InventoryDashboardQuery {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly from: string;
  readonly to: string;
  readonly granularity: InventoryDashboardGranularity;
  readonly recentLimit: number;
}
export interface InventoryAmount { readonly amount: string; readonly currency: "VES" }
export interface InventoryUnitFlow { readonly unit: string; readonly inbound: string; readonly outbound: string }
export interface InventoryDashboardSummary {
  readonly inboundValue: InventoryAmount;
  readonly outboundValue: InventoryAmount;
  readonly movementCount: number;
  readonly inventoryValue: InventoryAmount;
  readonly quantities: readonly InventoryUnitFlow[];
  readonly valuationDate: string;
}
export interface InventoryDashboardChartPoint {
  readonly date: string;
  readonly inboundValue: InventoryAmount;
  readonly outboundValue: InventoryAmount;
  readonly movementCount: number;
  readonly quantities: readonly InventoryUnitFlow[];
}
export interface RecentInventoryDocument {
  readonly id: string;
  readonly recordType: "invoice" | "delivery_note" | "debit_note" | "credit_note" | "other";
  readonly number: string;
  readonly counterparty: string | null;
  readonly date: string;
  readonly status: string;
  readonly total: InventoryAmount;
  readonly transactionCurrency: string;
  readonly sourceTotal: string | null;
}
export interface RecentInventoryMovement {
  readonly id:string;readonly productId:string;readonly productName:string;readonly productSku:string;readonly effectiveDate:string;
  readonly movementType:string;readonly direction:"inbound"|"outbound";
  readonly quantity:{readonly value:string;readonly unit:UnitOfMeasure};readonly totalCost:InventoryAmount;readonly reference:string|null;
}
export interface InventoryDashboardSnapshot {
  readonly period: { readonly from: string; readonly to: string; readonly granularity: InventoryDashboardGranularity };
  readonly summary: InventoryDashboardSummary;
  readonly charts: readonly InventoryDashboardChartPoint[];
  readonly recentSales: readonly RecentInventoryDocument[];
  readonly recentPurchases: readonly RecentInventoryDocument[];
  readonly recentInboundMovements:readonly RecentInventoryMovement[];
  readonly recentOutboundMovements:readonly RecentInventoryMovement[];
  readonly generatedAt: string;
}

export interface InventoryDashboardReader { read(query: InventoryDashboardQuery): Promise<InventoryDashboardSnapshot> }
export class InventoryDashboardFailure extends Error {
  constructor(readonly code: "INVENTORY_DASHBOARD_INVALID" | "INVENTORY_DASHBOARD_ACCESS_DENIED" | "INVENTORY_DASHBOARD_UNAVAILABLE", message: string, options?: ErrorOptions) {
    super(message, options); this.name = "InventoryDashboardFailure";
  }
}

export class GetInventoryDashboard {
  constructor(private readonly reader: InventoryDashboardReader) {}
  execute(query: InventoryDashboardQuery): Promise<InventoryDashboardSnapshot> { return this.reader.read(validateInventoryDashboardQuery(query)); }
}

export function validateInventoryDashboardQuery(query: InventoryDashboardQuery): InventoryDashboardQuery {
  const from = validDate(query.from), to = validDate(query.to);
  if (from > to) throw invalid("Dashboard start date must not be after its end date.");
  const days = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > 366) throw invalid("Dashboard periods cannot exceed 366 days.");
  if (query.granularity !== "day") throw invalid("Only day granularity is currently supported.");
  if (!Number.isSafeInteger(query.recentLimit) || query.recentLimit < 1 || query.recentLimit > 100) throw invalid("Recent-document limit must be between 1 and 100.");
  return Object.freeze({ ...query, from, to });
}

function validDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid("Dashboard dates must use YYYY-MM-DD format.");
  const [year,month,day]=value.split("-").map(Number) as [number,number,number];const parsed=new Date(Date.UTC(year,month-1,day));
  if(parsed.getUTCFullYear()!==year||parsed.getUTCMonth()!==month-1||parsed.getUTCDate()!==day)throw invalid("Dashboard date is invalid.");
  return value;
}
function invalid(message:string){return new InventoryDashboardFailure("INVENTORY_DASHBOARD_INVALID",message)}

export interface ReplenishmentPolicyRepository { update(input:{readonly actorUserId:UserId;readonly organizationId:OrganizationId;readonly companyId:CatalogCompanyId;readonly productId:ProductId;readonly minimumQuantity:string|null;readonly expectedVersion:number}):Promise<ReplenishmentPolicy> }
export class UpdateReplenishmentPolicy { constructor(private readonly repository:ReplenishmentPolicyRepository){} execute(input:{readonly actorUserId:UserId;readonly organizationId:OrganizationId;readonly companyId:CatalogCompanyId;readonly productId:ProductId;readonly minimumQuantity:string|null;readonly expectedVersion:number}){if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)throw new InventoryDashboardFailure("INVENTORY_DASHBOARD_INVALID","expectedVersion is invalid.");if(input.minimumQuantity!==null&&(!/^\d+(?:\.\d{1,4})?$/.test(input.minimumQuantity)||Number(input.minimumQuantity)<0))throw new InventoryDashboardFailure("INVENTORY_DASHBOARD_INVALID","minimumQuantity is invalid.");return this.repository.update(input);} }
