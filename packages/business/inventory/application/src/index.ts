import type { CompanyId as CatalogCompanyId } from "@kontave/companies/domain";
import { InventoryFailure, type ReplenishmentPolicy } from "@kontave/inventory-domain";
import type { CompanyId, OrganizationId, UserId } from "@kontave/organizations/domain";
import type { ProductId, UnitOfMeasure } from "@kontave/products-domain";

export * from "./inventory-operations";

/** Time bucket supported by the portable inventory dashboard. */
export type InventoryDashboardGranularity = "day";

/** Tenant scope and period requested from the inventory dashboard reader. */
export interface InventoryDashboardQuery {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly from: string;
  readonly to: string;
  readonly granularity: InventoryDashboardGranularity;
  readonly recentLimit: number;
}

/** Exact decimal inventory amount in the company's functional currency. */
export interface InventoryAmount {
  readonly amount: string;
  readonly currency: "VES";
}

/** Inbound and outbound quantities grouped by unit. */
export interface InventoryUnitFlow {
  readonly unit: string;
  readonly inbound: string;
  readonly outbound: string;
}

/** Aggregate inventory dashboard metrics for a requested period. */
export interface InventoryDashboardSummary {
  readonly inboundValue: InventoryAmount;
  readonly outboundValue: InventoryAmount;
  readonly movementCount: number;
  readonly inventoryValue: InventoryAmount;
  readonly quantities: readonly InventoryUnitFlow[];
  readonly valuationDate: string;
}

/** Daily inventory dashboard chart bucket. */
export interface InventoryDashboardChartPoint {
  readonly date: string;
  readonly inboundValue: InventoryAmount;
  readonly outboundValue: InventoryAmount;
  readonly movementCount: number;
  readonly quantities: readonly InventoryUnitFlow[];
}

/** Purchase or sale document projected into the inventory dashboard. */
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

/** Recent posted inventory movement projected for dashboard presentation. */
export interface RecentInventoryMovement {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSku: string;
  readonly effectiveDate: string;
  readonly movementType: string;
  readonly direction: "inbound" | "outbound";
  readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
  readonly totalCost: InventoryAmount;
  readonly reference: string | null;
}

/** Complete portable inventory dashboard response. */
export interface InventoryDashboardSnapshot {
  readonly period: {
    readonly from: string;
    readonly to: string;
    readonly granularity: InventoryDashboardGranularity;
  };
  readonly summary: InventoryDashboardSummary;
  readonly charts: readonly InventoryDashboardChartPoint[];
  readonly recentSales: readonly RecentInventoryDocument[];
  readonly recentPurchases: readonly RecentInventoryDocument[];
  readonly recentInboundMovements: readonly RecentInventoryMovement[];
  readonly recentOutboundMovements: readonly RecentInventoryMovement[];
  readonly generatedAt: string;
}

/** Query port owned by the inventory dashboard application layer. */
export interface InventoryDashboardReader {
  /** @returns The inventory dashboard snapshot for a validated query. */
  read(query: InventoryDashboardQuery): Promise<InventoryDashboardSnapshot>;
}

/** Expected failure exposed by inventory dashboard operations. */
export class InventoryDashboardFailure extends Error {
  /**
   * @param code - Stable machine-readable failure code.
   * @param message - Safe diagnostic message.
   * @param options - Optional underlying cause.
   */
  constructor(
    readonly code:
      | "INVENTORY_DASHBOARD_INVALID"
      | "INVENTORY_DASHBOARD_ACCESS_DENIED"
      | "INVENTORY_DASHBOARD_UNAVAILABLE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "InventoryDashboardFailure";
  }
}

/** Loads a validated inventory dashboard snapshot. */
export class GetInventoryDashboard {
  /** @param reader - Inventory dashboard query port. */
  constructor(private readonly reader: InventoryDashboardReader) {}

  /**
   * @param query - Tenant scope, date interval and recent-item limit.
   * @returns The portable inventory dashboard snapshot.
   * @throws {InventoryDashboardFailure} When validation or the reader fails.
   */
  execute(query: InventoryDashboardQuery): Promise<InventoryDashboardSnapshot> {
    const valid = validateInventoryDashboardQuery(query);
    return dashboardCall(() => this.reader.read(valid));
  }
}

/**
 * Validates and freezes an inventory dashboard query.
 * @param query - Untrusted dashboard query.
 * @returns The normalized immutable query.
 * @throws {InventoryDashboardFailure} When dates, period, granularity or limit are invalid.
 */
export function validateInventoryDashboardQuery(
  query: InventoryDashboardQuery,
): InventoryDashboardQuery {
  const from = validDate(query.from);
  const to = validDate(query.to);
  if (from > to) throw invalid("Dashboard start date must not be after its end date.");
  const days = Math.floor(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  ) + 1;
  if (days > 366) throw invalid("Dashboard periods cannot exceed 366 days.");
  if (query.granularity !== "day") {
    throw invalid("Only day granularity is currently supported.");
  }
  if (!Number.isSafeInteger(query.recentLimit) || query.recentLimit < 1 || query.recentLimit > 100) {
    throw invalid("Recent-document limit must be between 1 and 100.");
  }
  return Object.freeze({ ...query, from, to });
}

/** Input required to update a product replenishment policy. */
export interface UpdateReplenishmentPolicyInput {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CatalogCompanyId;
  readonly productId: ProductId;
  readonly minimumQuantity: string | null;
  readonly expectedVersion: number;
}

/** Persistence port for product replenishment policies. */
export interface ReplenishmentPolicyRepository {
  /** @returns The authoritative replenishment policy after an optimistic update. */
  update(input: UpdateReplenishmentPolicyInput): Promise<ReplenishmentPolicy>;
}

/** Updates a replenishment threshold using optimistic concurrency. */
export class UpdateReplenishmentPolicy {
  /** @param repository - Replenishment-policy persistence port. */
  constructor(private readonly repository: ReplenishmentPolicyRepository) {}

  /**
   * @param input - Scope, product, optional threshold and expected version.
   * @returns The authoritative updated policy.
   * @throws {InventoryDashboardFailure} When validation or persistence fails.
   */
  execute(input: UpdateReplenishmentPolicyInput): Promise<ReplenishmentPolicy> {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw invalid("expectedVersion is invalid.");
    }
    if (
      input.minimumQuantity !== null
      && (!/^\d+(?:\.\d{1,4})?$/.test(input.minimumQuantity) || Number(input.minimumQuantity) < 0)
    ) {
      throw invalid("minimumQuantity is invalid.");
    }
    return dashboardCall(() => this.repository.update(input));
  }
}

function validDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalid("Dashboard dates must use YYYY-MM-DD format.");
  }
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw invalid("Dashboard date is invalid.");
  }
  return value;
}

function invalid(message: string): InventoryDashboardFailure {
  return new InventoryDashboardFailure("INVENTORY_DASHBOARD_INVALID", message);
}

async function dashboardCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof InventoryDashboardFailure || cause instanceof InventoryFailure) throw cause;
    throw new InventoryDashboardFailure(
      "INVENTORY_DASHBOARD_UNAVAILABLE",
      "Inventory dashboard is unavailable.",
      { cause },
    );
  }
}
