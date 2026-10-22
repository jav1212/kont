import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  freezeInventoryBranchAdjustment,
  InventoryBranchAdjustmentFailure,
  type InventoryBranchAdjustment,
  type InventoryBranchAdjustmentWriter,
  type RecordInventoryBranchAdjustmentCommand,
} from "../../application";

const decimal = z.string();
const responseSchema = z.object({
  movementId: z.string().uuid(),
  branchId: z.string().uuid(),
  companyId: z.string().min(1),
  productId: z.string().min(1),
  type: z.enum(["ajuste_positivo", "ajuste_negativo", "autoconsumo"]),
  date: z.string().date(),
  quantity: decimal,
  unit: z.string().min(1),
  unitCostVes: decimal,
  totalCostVes: decimal,
  globalBalance: decimal,
  stockRevision: z.string().regex(/^(?:0|[1-9]\d*)$/),
});

/** Server-only adapter that invokes the transactional branch adjustment RPC. */
export class SupabaseInventoryBranchAdjustmentWriter implements InventoryBranchAdjustmentWriter {
  /**
   * @param client - Trusted Supabase client used exclusively through the adjustment RPC.
   * @returns A tenant-aware manual adjustment writer.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc InventoryBranchAdjustmentWriter.record} */
  async record(command: RecordInventoryBranchAdjustmentCommand): Promise<InventoryBranchAdjustment> {
    try {
      const { data, error } = await this.client.rpc("record_native_inventory_branch_adjustment", {
        p_actor_user_id: command.actorUserId,
        p_organization_id: command.organizationId,
        p_company_id: command.companyId,
        p_branch_id: command.branchId,
        p_product_id: command.productId,
        p_type: command.type,
        p_date: command.date,
        p_quantity: command.quantity,
        p_unit: command.unit,
        p_unit_cost_ves: command.unitCostVes,
        p_reference: command.reference,
        p_idempotency_key: command.idempotencyKey,
      });
      if (error) throw mapError(error);
      const parsed = responseSchema.safeParse(data);
      if (!parsed.success) throw unavailable("Inventory branch adjustment returned invalid data.", parsed.error);
      try {
        const result = freezeInventoryBranchAdjustment(parsed.data as InventoryBranchAdjustment);
        verifyResultMatchesCommand(result, command);
        return result;
      }
      catch (cause: unknown) { throw unavailable("Inventory branch adjustment returned inconsistent data.", cause); }
    } catch (cause: unknown) {
      if (cause instanceof InventoryBranchAdjustmentFailure) throw cause;
      throw unavailable("Inventory branch adjustment is unavailable.", cause);
    }
  }
}

/** Rejects a valid-looking RPC payload that belongs to another requested inventory operation. */
function verifyResultMatchesCommand(
  result: InventoryBranchAdjustment,
  command: RecordInventoryBranchAdjustmentCommand,
): void {
  if (
    result.branchId !== command.branchId
    || result.companyId !== command.companyId
    || result.productId !== command.productId
    || result.type !== command.type
    || result.date !== command.date
    || result.quantity !== command.quantity
    || result.unit !== command.unit
    || (command.type === "ajuste_positivo" && result.unitCostVes !== command.unitCostVes)
  ) throw unavailable("Inventory branch adjustment returned another operation.", result);
}

function mapError(error: { message: string }): InventoryBranchAdjustmentFailure {
  for (const code of [
    "INVENTORY_BRANCH_ADJUSTMENT_INVALID",
    "INVENTORY_BRANCH_ADJUSTMENT_ACCESS_DENIED",
    "INVENTORY_BRANCH_ADJUSTMENT_PERIOD_CLOSED",
    "INVENTORY_BRANCH_ADJUSTMENT_STOCK_INSUFFICIENT",
    "INVENTORY_BRANCH_ADJUSTMENT_IDEMPOTENCY_CONFLICT",
    "INVENTORY_BRANCH_ADJUSTMENT_PRODUCT_UNAVAILABLE",
  ] as const) {
    if (error.message.includes(code)) return new InventoryBranchAdjustmentFailure(code, messageFor(code), { cause: error });
  }
  return unavailable("Inventory branch adjustment is unavailable.", error);
}

function messageFor(code: Exclude<InventoryBranchAdjustmentFailure["code"], "INVENTORY_BRANCH_ADJUSTMENT_UNAVAILABLE">): string {
  const messages: Readonly<Record<Exclude<InventoryBranchAdjustmentFailure["code"], "INVENTORY_BRANCH_ADJUSTMENT_UNAVAILABLE">, string>> = {
    INVENTORY_BRANCH_ADJUSTMENT_INVALID: "Inventory branch adjustment is invalid.",
    INVENTORY_BRANCH_ADJUSTMENT_ACCESS_DENIED: "Inventory branch adjustment access was denied.",
    INVENTORY_BRANCH_ADJUSTMENT_PERIOD_CLOSED: "Inventory branch adjustment period is closed.",
    INVENTORY_BRANCH_ADJUSTMENT_STOCK_INSUFFICIENT: "Inventory branch adjustment has insufficient stock.",
    INVENTORY_BRANCH_ADJUSTMENT_IDEMPOTENCY_CONFLICT: "Inventory branch adjustment idempotency key conflicts with another request.",
    INVENTORY_BRANCH_ADJUSTMENT_PRODUCT_UNAVAILABLE: "Inventory branch adjustment product is unavailable.",
  };
  return messages[code];
}

function unavailable(message: string, cause: unknown): InventoryBranchAdjustmentFailure {
  return new InventoryBranchAdjustmentFailure("INVENTORY_BRANCH_ADJUSTMENT_UNAVAILABLE", message, { cause });
}
