import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  freezeInventoryBranchOpeningPlan,
  InventoryBranchOpeningPlanFailure,
  type InventoryBranchOpeningPlan,
  type InventoryBranchOpeningPlanQuery,
  type InventoryBranchOpeningPlanReader,
  type InventoryBranchOpeningPlanWriter,
  type ReplaceInventoryBranchOpeningPlanCommand,
} from "../../application";

const decimal = z.string();
const revision = z.string().regex(/^(?:0|[1-9]\d*)$/);
const lineSchema = z.object({
  branchId: z.string().uuid(),
  branchCode: z.string().min(1),
  quantity: decimal,
});
const responseSchema = z.object({
  productId: z.string().min(1),
  measureUnit: z.string().min(1),
  companyStock: decimal,
  stockRevision: revision,
  plan: z.object({
    revision: z.number().int().positive(),
    snapshotStockRevision: revision,
    snapshotCompanyStock: decimal,
    totalAllocated: decimal,
    stale: z.boolean(),
    updatedAt: z.string().datetime({ offset: true }),
    lines: z.array(lineSchema).min(1).max(100),
  }).nullable(),
});

/** Server-only Supabase RPC adapter for non-posting branch opening allocation drafts. */
export class SupabaseInventoryBranchOpeningPlanRepository
implements InventoryBranchOpeningPlanReader, InventoryBranchOpeningPlanWriter {
  /**
   * @param client - Trusted server client used only through the authoritative opening-plan RPCs.
   * @returns A tenant-aware opening-plan repository.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc InventoryBranchOpeningPlanReader.read} */
  async read(query: InventoryBranchOpeningPlanQuery): Promise<InventoryBranchOpeningPlan> {
    return this.rpc("get_native_inventory_branch_opening_plan", {
      p_actor_user_id: query.actorUserId,
      p_organization_id: query.organizationId,
      p_company_id: query.companyId,
      p_product_id: query.productId,
    }, query.productId);
  }

  /** {@inheritDoc InventoryBranchOpeningPlanWriter.replace} */
  async replace(command: ReplaceInventoryBranchOpeningPlanCommand): Promise<InventoryBranchOpeningPlan> {
    const result = await this.rpc("replace_native_inventory_branch_opening_plan", {
      p_actor_user_id: command.actorUserId,
      p_organization_id: command.organizationId,
      p_company_id: command.companyId,
      p_product_id: command.productId,
      p_expected_stock_revision: command.expectedStockRevision,
      p_expected_plan_revision: command.expectedPlanRevision,
      p_lines: command.lines.map((line) => ({ branchId: line.branchId, quantity: line.quantity })),
    }, command.productId);
    if (result.plan === null) {
      throw unavailable("Inventory branch opening replacement returned no draft.", result);
    }
    return result;
  }

  private async rpc(
    name: "get_native_inventory_branch_opening_plan" | "replace_native_inventory_branch_opening_plan",
    args: Record<string, unknown>,
    expectedProductId: string,
  ): Promise<InventoryBranchOpeningPlan> {
    try {
      const { data, error } = await this.client.rpc(name, args);
      if (error) throw mapError(error);
      const parsed = responseSchema.safeParse(data);
      if (!parsed.success) throw unavailable("Inventory branch opening allocation returned invalid data.", parsed.error);
      let result: InventoryBranchOpeningPlan;
      try {
        result = freezeInventoryBranchOpeningPlan(parsed.data as unknown as InventoryBranchOpeningPlan);
      } catch (cause: unknown) {
        throw unavailable("Inventory branch opening allocation returned inconsistent data.", cause);
      }
      if (result.productId !== expectedProductId) {
        throw unavailable("Inventory branch opening allocation returned another product.", result);
      }
      return result;
    } catch (cause: unknown) {
      if (cause instanceof InventoryBranchOpeningPlanFailure) throw cause;
      throw unavailable("Inventory branch opening allocation is unavailable.", cause);
    }
  }
}

function mapError(error: { message: string }): InventoryBranchOpeningPlanFailure {
  for (const code of [
    "INVENTORY_BRANCH_OPENING_ACCESS_DENIED",
    "INVENTORY_BRANCH_OPENING_INVALID",
    "INVENTORY_BRANCH_OPENING_STOCK_CONFLICT",
    "INVENTORY_BRANCH_OPENING_PLAN_CONFLICT",
    "INVENTORY_BRANCH_OPENING_STOCK_NOT_POSITIVE",
    "INVENTORY_BRANCH_OPENING_SUM_MISMATCH",
  ] as const) {
    if (error.message.includes(code)) {
      return new InventoryBranchOpeningPlanFailure(code, openingMessage(code), { cause: error });
    }
  }
  return unavailable("Inventory branch opening allocation is unavailable.", error);
}

function openingMessage(code: Exclude<InventoryBranchOpeningPlanFailure["code"], "INVENTORY_BRANCH_OPENING_UNAVAILABLE">): string {
  const messages: Readonly<Record<Exclude<InventoryBranchOpeningPlanFailure["code"], "INVENTORY_BRANCH_OPENING_UNAVAILABLE">, string>> = {
    INVENTORY_BRANCH_OPENING_ACCESS_DENIED: "Inventory branch opening allocation access was denied.",
    INVENTORY_BRANCH_OPENING_INVALID: "Inventory branch opening allocation is invalid.",
    INVENTORY_BRANCH_OPENING_STOCK_CONFLICT: "Inventory stock changed before the opening allocation could be saved.",
    INVENTORY_BRANCH_OPENING_PLAN_CONFLICT: "Inventory branch opening allocation changed before it could be saved.",
    INVENTORY_BRANCH_OPENING_STOCK_NOT_POSITIVE: "Inventory branch opening allocation requires positive company stock.",
    INVENTORY_BRANCH_OPENING_SUM_MISMATCH: "Inventory branch opening allocation must equal company stock.",
  };
  return messages[code];
}

function unavailable(message: string, cause: unknown): InventoryBranchOpeningPlanFailure {
  return new InventoryBranchOpeningPlanFailure("INVENTORY_BRANCH_OPENING_UNAVAILABLE", message, { cause });
}
