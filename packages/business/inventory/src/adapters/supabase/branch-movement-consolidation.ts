import { exactDecimal } from "@kontave/monetary/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type {
  InventoryBranchMovementConsolidation,
  InventoryBranchMovementConsolidationQuery,
  InventoryBranchMovementConsolidationReader,
} from "../../application";
import { InventoryBranchMovementConsolidationFailure } from "../../application";

const rowSchema = z.object({
  branchId: z.string().uuid(),
  branchCode: z.string().min(1),
  branchName: z.string().min(1),
  sourceType: z.enum(["purchase", "sale", "manual", "historical"]),
  productId: z.string().min(1),
  productName: z.string().min(1),
  measureUnit: z.string().min(1),
  movementType: z.string().min(1),
  movementCount: z.number().int().nonnegative(),
  quantity: z.string(),
  totalCostVes: z.string(),
});
const responseSchema = z.object({
  period: z.object({ from: z.string().date(), to: z.string().date() }),
  rows: z.array(rowSchema),
  coverage: z.object({
    attributedMovementCount: z.number().int().nonnegative(),
    linkedWithoutBranchMovementCount: z.number().int().nonnegative().nullable(),
    unlinkedMovementCount: z.number().int().nonnegative().nullable(),
    includesCompanyWideCoverage: z.boolean(),
  }),
  generatedAt: z.string().datetime({ offset: true }),
});

/** Supabase RPC adapter for inventory movements consolidated by their source-document branch. */
export class SupabaseInventoryBranchMovementConsolidationReader
implements InventoryBranchMovementConsolidationReader {
  /**
   * Creates a server-side reader that invokes the authoritative consolidation RPC.
   * @param client - Server-side Supabase client used only through the consolidation RPC.
   * @returns A tenant-aware branch movement consolidation reader.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc InventoryBranchMovementConsolidationReader.read} */
  async read(
    query: InventoryBranchMovementConsolidationQuery,
  ): Promise<InventoryBranchMovementConsolidation> {
    try {
      const { data, error } = await this.client.rpc("get_native_inventory_branch_movement_consolidation", {
        p_actor_user_id: query.actorUserId,
        p_organization_id: query.organizationId,
        p_company_id: query.companyId,
        p_from: query.from,
        p_to: query.to,
        p_branch_ids: query.branchIds ?? null,
      });
      if (error) throw mapError(error);
      const parsed = responseSchema.safeParse(data);
      if (!parsed.success) throw unavailable("Inventory branch movement consolidation returned invalid data.", parsed.error);
      if (parsed.data.period.from !== query.from || parsed.data.period.to !== query.to) {
        throw unavailable("Inventory branch movement consolidation returned a different period.", parsed.data.period);
      }
      if (!validCoverage(parsed.data.coverage)) {
        throw unavailable("Inventory branch movement consolidation returned invalid coverage.", parsed.data.coverage);
      }
      return freezeResponse(parsed.data);
    } catch (cause: unknown) {
      if (cause instanceof InventoryBranchMovementConsolidationFailure) throw cause;
      throw unavailable("Inventory branch movement consolidation is unavailable.", cause);
    }
  }
}

function freezeResponse(data: z.infer<typeof responseSchema>): InventoryBranchMovementConsolidation {
  const rows = Object.freeze(data.rows.map((row) => Object.freeze({
    ...row,
    quantity: exactDecimal(row.quantity),
    totalCostVes: exactDecimal(row.totalCostVes),
  })));
  return Object.freeze({
    period: Object.freeze({ ...data.period }),
    rows,
    coverage: Object.freeze({ ...data.coverage }),
    generatedAt: data.generatedAt,
  });
}

function mapError(error: { message: string }): InventoryBranchMovementConsolidationFailure {
  if (error.message.includes("INVENTORY_BRANCH_CONSOLIDATION_ACCESS_DENIED")) {
    return new InventoryBranchMovementConsolidationFailure(
      "INVENTORY_BRANCH_MOVEMENT_CONSOLIDATION_ACCESS_DENIED",
      "Inventory branch movement consolidation access was denied.",
      { cause: error },
    );
  }
  if (error.message.includes("INVENTORY_BRANCH_CONSOLIDATION_INVALID")) {
    return new InventoryBranchMovementConsolidationFailure(
      "INVENTORY_BRANCH_MOVEMENT_CONSOLIDATION_INVALID",
      "Inventory branch movement consolidation query is invalid.",
      { cause: error },
    );
  }
  return unavailable("Inventory branch movement consolidation is unavailable.", error);
}

function validCoverage(
  coverage: z.infer<typeof responseSchema>["coverage"],
): boolean {
  const companyWideCounts = [
    coverage.linkedWithoutBranchMovementCount,
    coverage.unlinkedMovementCount,
  ];
  return coverage.includesCompanyWideCoverage
    ? companyWideCounts.every((count) => count !== null)
    : companyWideCounts.every((count) => count === null);
}

function unavailable(
  message: string,
  cause: unknown,
): InventoryBranchMovementConsolidationFailure {
  return new InventoryBranchMovementConsolidationFailure(
    "INVENTORY_BRANCH_MOVEMENT_CONSOLIDATION_UNAVAILABLE",
    message,
    { cause },
  );
}
