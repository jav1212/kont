import { exactDecimal } from "@kontave/monetary/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type {
  InventoryBranchStockReadiness,
  InventoryBranchStockReadinessQuery,
  InventoryBranchStockReadinessReader,
} from "../../application";
import { InventoryBranchStockReadinessFailure } from "../../application";

const count = z.number().int().safe().nonnegative();
const mismatchSchema = z.object({
  productId: z.string().min(1),
  code: z.string(),
  measureUnit: z.string().min(1),
  currentStock: z.string(),
  signedMovementQuantity: z.string(),
  difference: z.string(),
});
const responseSchema = z.object({
  totalProducts: count,
  nonzeroStockProducts: count,
  movementReconciliationMismatchProducts: count,
  linkedWithoutBranchMovementCount: count,
  unlinkedMovementCount: count,
  attributedMovementCount: count,
  unsupportedMovementCount: count,
  branchCount: count,
  mismatches: z.array(mismatchSchema),
  generatedAt: z.string().datetime({ offset: true }),
});

/** Server-only Supabase RPC adapter for branch-stock migration readiness diagnostics. */
export class SupabaseInventoryBranchStockReadinessReader implements InventoryBranchStockReadinessReader {
  /**
   * @param client - Trusted server client used only through the authoritative readiness RPC.
   * @returns A tenant-aware branch-stock readiness reader.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc InventoryBranchStockReadinessReader.read} */
  async read(query: InventoryBranchStockReadinessQuery): Promise<InventoryBranchStockReadiness> {
    try {
      const { data, error } = await this.client.rpc("get_native_inventory_branch_stock_readiness", {
        p_actor_user_id: query.actorUserId,
        p_organization_id: query.organizationId,
        p_company_id: query.companyId,
        p_mismatch_limit: query.mismatchSampleLimit,
      });
      if (error) throw mapError(error);
      const parsed = responseSchema.safeParse(data);
      if (!parsed.success) throw unavailable("Inventory branch-stock readiness returned invalid data.", parsed.error);
      if (parsed.data.mismatches.length > query.mismatchSampleLimit!) {
        throw unavailable("Inventory branch-stock readiness exceeded the requested sample limit.", parsed.data);
      }
      if (parsed.data.movementReconciliationMismatchProducts < parsed.data.mismatches.length) {
        throw unavailable("Inventory branch-stock readiness returned too many mismatch samples.", parsed.data);
      }
      return freezeResponse(parsed.data);
    } catch (cause: unknown) {
      if (cause instanceof InventoryBranchStockReadinessFailure) throw cause;
      throw unavailable("Inventory branch-stock readiness diagnostic is unavailable.", cause);
    }
  }
}

function freezeResponse(data: z.infer<typeof responseSchema>): InventoryBranchStockReadiness {
  const mismatches = Object.freeze(data.mismatches.map((mismatch) => Object.freeze({
    ...mismatch,
    currentStock: exactDecimal(mismatch.currentStock),
    signedMovementQuantity: exactDecimal(mismatch.signedMovementQuantity),
    difference: exactDecimal(mismatch.difference),
  })));
  return Object.freeze({ ...data, mismatches });
}

function mapError(error: { message: string }): InventoryBranchStockReadinessFailure {
  if (error.message.includes("INVENTORY_BRANCH_STOCK_READINESS_ACCESS_DENIED")) {
    return new InventoryBranchStockReadinessFailure(
      "INVENTORY_BRANCH_STOCK_READINESS_ACCESS_DENIED",
      "Inventory branch-stock readiness access was denied.",
      { cause: error },
    );
  }
  if (error.message.includes("INVENTORY_BRANCH_STOCK_READINESS_INVALID")) {
    return new InventoryBranchStockReadinessFailure(
      "INVENTORY_BRANCH_STOCK_READINESS_INVALID",
      "Inventory branch-stock readiness query is invalid.",
      { cause: error },
    );
  }
  return unavailable("Inventory branch-stock readiness diagnostic is unavailable.", error);
}

function unavailable(message: string, cause: unknown): InventoryBranchStockReadinessFailure {
  return new InventoryBranchStockReadinessFailure(
    "INVENTORY_BRANCH_STOCK_READINESS_UNAVAILABLE",
    message,
    { cause },
  );
}
