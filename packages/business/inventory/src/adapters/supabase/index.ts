import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { companyId } from "@kontave/companies/domain";
import {
  InventoryDashboardFailure,
  type InventoryDashboardQuery,
  type InventoryDashboardReader,
  type InventoryDashboardSnapshot,
  type ReplenishmentPolicyRepository,
} from "../../application";
import { InventoryFailure, ReplenishmentPolicy } from "../../domain";
import { productId, UnitOfMeasure } from "@kontave/products/domain";
import { z } from "zod";
import { SupabaseInventoryOperationsRepository } from "./inventory-operations";
import { SupabaseCrossCompanyInventoryCompensationRepository, SupabaseCrossCompanyInventoryTransferRepository } from "./cross-company-transfer";
import { SupabaseInventoryBranchMovementConsolidationReader } from "./branch-movement-consolidation";
import { SupabaseInventoryBranchStockReadinessReader } from "./branch-stock-readiness";
import { SupabaseInventoryBranchOpeningPlanRepository } from "./branch-opening-plan";
import { SupabaseInventoryBranchAdjustmentWriter } from "./branch-adjustment";
import { SupabaseHistoricalInventoryMovementAttributionRepository } from "./historical-movement-attribution";

export * from "./inventory-operations";
export * from "./cross-company-transfer";
export * from "./branch-movement-consolidation";
export * from "./branch-stock-readiness";
export * from "./branch-opening-plan";
export * from "./branch-adjustment";
export * from "./historical-movement-attribution";

const amountSchema = z.object({ amount: z.string(), currency: z.literal("VES") });
const quantitySchema = z.object({ unit: z.string(), inbound: z.string(), outbound: z.string() });
const documentSchema = z.object({
  id: z.string(),
  recordType: z.enum(["invoice", "delivery_note", "debit_note", "credit_note", "other"]),
  number: z.string(),
  counterparty: z.string().nullable(),
  date: z.string(),
  status: z.string(),
  total: amountSchema,
  transactionCurrency: z.string(),
  sourceTotal: z.string().nullable(),
});
const recentMovementSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  productSku: z.string(),
  effectiveDate: z.string(),
  movementType: z.string(),
  direction: z.enum(["inbound", "outbound"]),
  quantity: z.object({ value: z.string(), unit: z.nativeEnum(UnitOfMeasure) }),
  totalCost: amountSchema,
  reference: z.string().nullable(),
});
const snapshotSchema = z.object({
  period: z.object({ from: z.string(), to: z.string(), granularity: z.literal("day") }),
  summary: z.object({
    inboundValue: amountSchema,
    outboundValue: amountSchema,
    movementCount: z.number().int().nonnegative(),
    inventoryValue: amountSchema,
    quantities: z.array(quantitySchema),
    valuationDate: z.string(),
  }),
  charts: z.array(z.object({
    date: z.string(),
    inboundValue: amountSchema,
    outboundValue: amountSchema,
    movementCount: z.number().int().nonnegative(),
    quantities: z.array(quantitySchema),
  })),
  recentSales: z.array(documentSchema),
  recentPurchases: z.array(documentSchema),
  recentInboundMovements: z.array(recentMovementSchema),
  recentOutboundMovements: z.array(recentMovementSchema),
  generatedAt: z.string(),
});
const replenishmentSchema = z.object({
  companyId: z.string(),
  productId: z.string(),
  unit: z.nativeEnum(UnitOfMeasure),
  minimumQuantity: z.string().nullable(),
  version: z.number().int().positive(),
  updatedAt: z.string(),
});

/** Supabase-backed inventory dashboard reader. */
export class SupabaseInventoryDashboardReader implements InventoryDashboardReader {
  /** @param client - Server-side Supabase client used by dashboard RPCs. */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc InventoryDashboardReader.read} */
  async read(query: InventoryDashboardQuery): Promise<InventoryDashboardSnapshot> {
    try {
      const { data, error } = await this.client.rpc("get_shared_inventory_dashboard_snapshot", {
        p_actor_user_id: query.actorUserId,
        p_organization_id: query.organizationId,
        p_company_id: query.companyId,
        p_from: query.from,
        p_to: query.to,
        p_granularity: query.granularity,
        p_recent_limit: query.recentLimit,
      });
      if (error) throw dashboardError(error);
      const parsed = snapshotSchema.safeParse(data);
      if (!parsed.success) {
        throw new InventoryDashboardFailure(
          "INVENTORY_DASHBOARD_UNAVAILABLE",
          "Inventory dashboard returned invalid data.",
          { cause: parsed.error },
        );
      }
      return parsed.data;
    } catch (cause: unknown) {
      if (cause instanceof InventoryDashboardFailure) throw cause;
      throw new InventoryDashboardFailure(
        "INVENTORY_DASHBOARD_UNAVAILABLE",
        "Inventory dashboard is unavailable.",
        { cause },
      );
    }
  }
}

/** Supabase-backed replenishment-policy repository. */
export class SupabaseReplenishmentPolicyRepository implements ReplenishmentPolicyRepository {
  /** @param client - Server-side Supabase client used by replenishment RPCs. */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc ReplenishmentPolicyRepository.update} */
  async update(
    input: Parameters<ReplenishmentPolicyRepository["update"]>[0],
  ): Promise<ReplenishmentPolicy> {
    try {
      const { data, error } = await this.client.rpc("update_native_replenishment_policy", {
        p_actor_user_id: input.actorUserId,
        p_organization_id: input.organizationId,
        p_company_id: input.companyId,
        p_product_id: input.productId,
        p_minimum_quantity: input.minimumQuantity,
        p_expected_version: input.expectedVersion,
      });
      if (error) {
        throw new InventoryFailure(
          error.message.includes("INVENTORY_PROFILE_VERSION_CONFLICT")
            ? "INVENTORY_PROFILE_VERSION_CONFLICT"
            : "INVENTORY_REPOSITORY_UNAVAILABLE",
          error.message,
          { cause: error },
        );
      }
      const parsed = replenishmentSchema.safeParse(data);
      if (!parsed.success) throw repositoryUnavailable(parsed.error);
      return new ReplenishmentPolicy({
        ...parsed.data,
        companyId: companyId(parsed.data.companyId),
        productId: productId(parsed.data.productId),
      });
    } catch (cause: unknown) {
      if (cause instanceof InventoryFailure) throw cause;
      throw repositoryUnavailable(cause);
    }
  }
}

/** Credentials required by server-side inventory adapters. */
export interface InventorySupabaseConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/**
 * Creates a stateless Supabase inventory dashboard reader.
 * @param configuration - Supabase endpoint and service-role credential.
 * @returns A configured inventory dashboard reader.
 */
export function createSupabaseInventoryDashboardReader(
  configuration: InventorySupabaseConfiguration,
): SupabaseInventoryDashboardReader {
  return new SupabaseInventoryDashboardReader(createInventoryClient(configuration));
}

/**
 * Creates a stateless Supabase replenishment-policy repository.
 * @param configuration - Supabase endpoint and service-role credential.
 * @returns A configured replenishment repository.
 */
export function createSupabaseReplenishmentPolicyRepository(
  configuration: InventorySupabaseConfiguration,
): SupabaseReplenishmentPolicyRepository {
  return new SupabaseReplenishmentPolicyRepository(createInventoryClient(configuration));
}

/**
 * Creates a stateless Supabase inventory-operations repository.
 * @param configuration - Supabase endpoint and service-role credential.
 * @returns A configured inventory operations repository.
 */
export function createSupabaseInventoryOperationsRepository(
  configuration: InventorySupabaseConfiguration,
): SupabaseInventoryOperationsRepository {
  return new SupabaseInventoryOperationsRepository(createInventoryClient(configuration));
}

/**
 * Creates a stateless reader for branch-attributed inventory movement consolidations.
 * @param configuration - Supabase endpoint and service-role credential kept on the server.
 * @returns A reader that authorizes every request in the database RPC.
 */
export function createSupabaseInventoryBranchMovementConsolidationReader(
  configuration: InventorySupabaseConfiguration,
): SupabaseInventoryBranchMovementConsolidationReader {
  return new SupabaseInventoryBranchMovementConsolidationReader(createInventoryClient(configuration));
}

/**
 * Creates a server-side reader for the branch-stock migration readiness diagnostic.
 * @param configuration - Supabase endpoint and service-role credential kept on the server.
 * @returns A reader that re-authorizes each diagnostic request in its database RPC.
 */
export function createSupabaseInventoryBranchStockReadinessReader(
  configuration: InventorySupabaseConfiguration,
): SupabaseInventoryBranchStockReadinessReader {
  return new SupabaseInventoryBranchStockReadinessReader(createInventoryClient(configuration));
}

/**
 * Creates a server-side repository for a non-posting branch-stock opening allocation draft.
 * @param configuration - Supabase endpoint and service-role credential kept on the server.
 * @returns A repository that re-authorizes reads and writes in its database RPCs.
 */
export function createSupabaseInventoryBranchOpeningPlanRepository(
  configuration: InventorySupabaseConfiguration,
): SupabaseInventoryBranchOpeningPlanRepository {
  return new SupabaseInventoryBranchOpeningPlanRepository(createInventoryClient(configuration));
}

/**
 * Creates a server-side writer for atomic manual branch inventory adjustments.
 * @param configuration - Supabase endpoint and service-role credential kept on the server.
 * @returns A writer that re-authorizes each adjustment inside its database RPC.
 */
export function createSupabaseInventoryBranchAdjustmentWriter(
  configuration: InventorySupabaseConfiguration,
): SupabaseInventoryBranchAdjustmentWriter {
  return new SupabaseInventoryBranchAdjustmentWriter(createInventoryClient(configuration));
}

/**
 * Creates a server-side repository for reviewed historical movement attribution.
 * @param configuration - Supabase endpoint and service-role credential kept on the server.
 * @returns A repository that re-authorizes both preview and attribution inside database RPCs.
 */
export function createSupabaseHistoricalInventoryMovementAttributionRepository(
  configuration: InventorySupabaseConfiguration,
): SupabaseHistoricalInventoryMovementAttributionRepository {
  return new SupabaseHistoricalInventoryMovementAttributionRepository(createInventoryClient(configuration));
}

/**
 * Creates a server-side RPC adapter for atomic company-to-company inventory transfers.
 * @param configuration - Supabase endpoint and service-role credential kept on the server.
 * @returns A transfer repository that re-authorizes through its database RPCs.
 */
export function createSupabaseCrossCompanyInventoryTransferRepository(
  configuration: InventorySupabaseConfiguration,
): SupabaseCrossCompanyInventoryTransferRepository {
  return new SupabaseCrossCompanyInventoryTransferRepository(createInventoryClient(configuration));
}

/**
 * Creates a server-side RPC adapter for paired physical transfer compensation.
 * @param configuration - Supabase endpoint and service-role credential kept on the server.
 * @returns A compensation repository that preserves original transfer history.
 */
export function createSupabaseCrossCompanyInventoryCompensationRepository(
  configuration: InventorySupabaseConfiguration,
): SupabaseCrossCompanyInventoryCompensationRepository {
  return new SupabaseCrossCompanyInventoryCompensationRepository(createInventoryClient(configuration));
}

function createInventoryClient(configuration: InventorySupabaseConfiguration): SupabaseClient {
  return createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function dashboardError(error: { message: string }): InventoryDashboardFailure {
  if (error.message.includes("INVENTORY_DASHBOARD_ACCESS_DENIED")) {
    return new InventoryDashboardFailure(
      "INVENTORY_DASHBOARD_ACCESS_DENIED",
      "Inventory dashboard access was denied.",
      { cause: error },
    );
  }
  if (error.message.includes("INVENTORY_DASHBOARD_INVALID")) {
    return new InventoryDashboardFailure(
      "INVENTORY_DASHBOARD_INVALID",
      "Inventory dashboard query is invalid.",
      { cause: error },
    );
  }
  return new InventoryDashboardFailure(
    "INVENTORY_DASHBOARD_UNAVAILABLE",
    "Inventory dashboard is unavailable.",
    { cause: error },
  );
}

function repositoryUnavailable(cause: unknown): InventoryFailure {
  return new InventoryFailure(
    "INVENTORY_REPOSITORY_UNAVAILABLE",
    "Inventory repository is unavailable.",
    { cause },
  );
}
