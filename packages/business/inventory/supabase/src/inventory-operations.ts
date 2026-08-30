import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateInventoryOperationInput,
  InventoryFlowPage,
  InventoryFlowQuery,
  InventoryOperationCommand,
  InventoryOperationDetail,
  InventoryOperationsRepository,
  ReverseInventoryOperationCommand,
  UpdateInventoryOperationInput,
} from "@kontave/inventory-application";
import { InventoryFailure } from "@kontave/inventory-domain";
import { UnitOfMeasure } from "@kontave/products-domain";
import { z } from "zod";

const amountSchema = z.object({ amount: z.string(), currency: z.literal("VES") });
const reasonSchema = z.enum([
  "opening_balance",
  "purchase_receipt",
  "sales_issue",
  "customer_return",
  "supplier_return",
  "transfer",
  "stock_count_adjustment",
  "self_consumption",
  "production_consumption",
  "production_output",
  "reversal",
]);
const flowItemSchema = z.object({
  id: z.string(),
  operationId: z.string(),
  effectiveDate: z.string(),
  direction: z.enum(["inbound", "outbound"]),
  reason: reasonSchema,
  status: z.enum(["draft", "posted", "reversed"]),
  product: z.object({ id: z.string(), sku: z.string(), name: z.string() }),
  quantity: z.object({ value: z.string(), unit: z.nativeEnum(UnitOfMeasure) }),
  unitCost: amountSchema.nullable(),
  totalCost: amountSchema.nullable(),
  source: z.object({
    kind: z.enum(["purchasing", "sales", "inventory", "production", "migration"]),
    documentId: z.string(),
  }),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  postedAt: z.string().nullable(),
});
const pageSchema = z.object({
  items: z.array(flowItemSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
  summary: z.object({
    movementCount: z.number().int().nonnegative(),
    totalValue: amountSchema,
    quantities: z.array(z.object({ unit: z.nativeEnum(UnitOfMeasure), value: z.string() })),
  }),
});
const detailSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  reason: reasonSchema,
  effectiveDate: z.string(),
  status: z.enum(["draft", "posted", "reversed"]),
  version: z.number().int().positive(),
  source: z.object({
    kind: z.enum(["purchasing", "sales", "inventory", "production", "migration"]),
    documentId: z.string(),
  }),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  postedAt: z.string().nullable(),
  reversalOf: z.string().nullable(),
  reversedBy: z.string().nullable(),
  lines: z.array(z.object({
    id: z.string(),
    productId: z.string(),
    productName: z.string(),
    productSku: z.string(),
    direction: z.enum(["inbound", "outbound"]),
    quantity: z.object({ value: z.string(), unit: z.nativeEnum(UnitOfMeasure) }),
    unitCost: amountSchema.nullable(),
    movementId: z.string().nullable(),
  })),
  capabilities: z.object({
    canPost: z.boolean(),
    canReverse: z.boolean(),
    canEditMetadata: z.boolean(),
  }),
});

/** Supabase-backed inventory operations repository. */
export class SupabaseInventoryOperationsRepository implements InventoryOperationsRepository {
  /** @param client - Server-side Supabase client used by inventory RPCs. */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc InventoryOperationsRepository.list} */
  async list(query: InventoryFlowQuery): Promise<InventoryFlowPage> {
    return this.rpc("list_native_inventory_flows", {
      p_actor_user_id: query.actorUserId,
      p_organization_id: query.organizationId,
      p_company_id: query.companyId,
      p_from: query.from,
      p_to: query.to,
      p_direction: query.direction ?? null,
      p_reason: query.reason ?? null,
      p_source_kind: query.sourceKind ?? null,
      p_product_id: query.productId ?? null,
      p_status: query.status ?? null,
      p_search: query.search ?? null,
      p_cursor: query.cursor ?? null,
      p_limit: query.limit,
    }, pageSchema);
  }

  /** {@inheritDoc InventoryOperationsRepository.get} */
  async get(
    input: Omit<InventoryOperationCommand, "expectedVersion">,
  ): Promise<InventoryOperationDetail> {
    return this.rpc("get_native_inventory_operation", {
      p_actor_user_id: input.actorUserId,
      p_organization_id: input.organizationId,
      p_company_id: input.companyId,
      p_operation_id: input.operationId,
    }, detailSchema);
  }

  /** {@inheritDoc InventoryOperationsRepository.create} */
  async create(input: CreateInventoryOperationInput): Promise<InventoryOperationDetail> {
    return this.rpc("create_native_inventory_operation", {
      p_actor_user_id: input.actorUserId,
      p_organization_id: input.organizationId,
      p_company_id: input.companyId,
      p_reason: input.reason,
      p_effective_date: input.effectiveDate,
      p_reference: input.reference ?? null,
      p_notes: input.notes ?? null,
      p_lines: input.lines,
    }, detailSchema);
  }

  /** {@inheritDoc InventoryOperationsRepository.update} */
  async update(input: UpdateInventoryOperationInput): Promise<InventoryOperationDetail> {
    return this.rpc("update_native_inventory_operation", {
      p_actor_user_id: input.actorUserId,
      p_organization_id: input.organizationId,
      p_company_id: input.companyId,
      p_operation_id: input.operationId,
      p_expected_version: input.expectedVersion,
      p_changes: {
        ...(input.effectiveDate !== undefined ? { effectiveDate: input.effectiveDate } : {}),
        ...(input.reference !== undefined ? { reference: input.reference } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    }, detailSchema);
  }

  /** {@inheritDoc InventoryOperationsRepository.post} */
  async post(input: InventoryOperationCommand): Promise<InventoryOperationDetail> {
    return this.rpc("post_native_inventory_operation", {
      p_actor_user_id: input.actorUserId,
      p_organization_id: input.organizationId,
      p_company_id: input.companyId,
      p_operation_id: input.operationId,
      p_expected_version: input.expectedVersion,
    }, detailSchema);
  }

  /** {@inheritDoc InventoryOperationsRepository.reverse} */
  async reverse(input: ReverseInventoryOperationCommand): Promise<InventoryOperationDetail> {
    return this.rpc("reverse_native_inventory_operation", {
      p_actor_user_id: input.actorUserId,
      p_organization_id: input.organizationId,
      p_company_id: input.companyId,
      p_operation_id: input.operationId,
      p_expected_version: input.expectedVersion,
      p_effective_date: input.effectiveDate,
      p_reason: input.reason,
    }, detailSchema);
  }

  private async rpc<TSchema extends z.ZodType>(
    name: string,
    args: Record<string, unknown>,
    schema: TSchema,
  ): Promise<z.infer<TSchema>> {
    try {
      const { data, error } = await this.client.rpc(name, args);
      if (error) throw mapError(error);
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        throw new InventoryFailure(
          "INVENTORY_REPOSITORY_UNAVAILABLE",
          "Inventory operations returned invalid data.",
          { cause: parsed.error },
        );
      }
      return parsed.data;
    } catch (cause: unknown) {
      if (cause instanceof InventoryFailure) throw cause;
      throw new InventoryFailure(
        "INVENTORY_REPOSITORY_UNAVAILABLE",
        "Inventory repository is unavailable.",
        { cause },
      );
    }
  }
}

function mapError(error: { message: string }): InventoryFailure {
  const codes = [
    "INVENTORY_OPERATION_NOT_FOUND",
    "INVENTORY_OPERATION_VERSION_CONFLICT",
    "INVENTORY_OPERATION_TRANSITION_INVALID",
    "INVENTORY_OPERATION_ACCESS_DENIED",
    "INVENTORY_PERIOD_CLOSED",
    "INVENTORY_NEGATIVE_STOCK",
    "INVENTORY_OPERATION_INVALID",
  ] as const;
  const code = codes.find((candidate) => error.message.includes(candidate))
    ?? "INVENTORY_REPOSITORY_UNAVAILABLE";
  return new InventoryFailure(code, error.message, { cause: error });
}
