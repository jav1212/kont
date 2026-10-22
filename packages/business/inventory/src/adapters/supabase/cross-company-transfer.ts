import type { SupabaseClient } from "@supabase/supabase-js";
import { companyId } from "@kontave/companies/domain";
import { productId, UnitOfMeasure } from "@kontave/products/domain";
import type {
  CrossCompanyInventoryCompensationPreview,
  CrossCompanyInventoryCompensationReceipt,
  CrossCompanyInventoryCompensationRepository,
  CrossCompanyInventoryTransferPreview,
  CrossCompanyInventoryTransferReceipt,
  CrossCompanyInventoryTransferRepository,
  ExecuteCrossCompanyInventoryTransferCommand,
  PreviewCrossCompanyInventoryTransferCommand,
  ExecuteCrossCompanyInventoryCompensationCommand,
  PreviewCrossCompanyInventoryCompensationCommand,
} from "../../application";
import { crossCompanyInventoryTransferId, InventoryFailure } from "../../domain";
import { z } from "zod";

const previewSchema = z.object({
  sourceCompanyId: z.string(),
  destinationCompanyId: z.string(),
  sourceSnapshotToken: z.string(),
  destinationSnapshotToken: z.string(),
});
const receiptSchema = z.object({
  transferId: z.string(),
  sourceCompanyId: z.string(),
  destinationCompanyId: z.string(),
  sourceOperationId: z.string(),
  destinationOperationId: z.string(),
  replayed: z.boolean(),
});
const compensationPreviewSchema = z.object({ originalTransferId: z.string(), sourceCompanyId: z.string(), destinationCompanyId: z.string(), effectiveDate: z.string(), lines: z.array(z.object({ sourceProductId: z.string(), destinationProductId: z.string(), quantity: z.string(), unit: z.string() })), sourceSnapshotToken: z.string(), destinationSnapshotToken: z.string() });
const compensationReceiptSchema = z.object({ originalTransferId: z.string(), compensationTransferId: z.string(), sourceCompanyId: z.string(), destinationCompanyId: z.string(), sourceOperationId: z.string(), destinationOperationId: z.string(), replayed: z.boolean() });

/**
 * Server-only Supabase RPC adapter for the paired ADM-015 inventory-transfer boundary.
 * Its caller supplies an authenticated actor; service-role access is used solely to invoke
 * database functions that re-authorize the actor and commit the two company sides atomically.
 */
export class SupabaseCrossCompanyInventoryTransferRepository implements CrossCompanyInventoryTransferRepository {
  /** @param client - Trusted server Supabase client used only for transfer RPCs. */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc CrossCompanyInventoryTransferRepository.preview} */
  async preview(command: PreviewCrossCompanyInventoryTransferCommand): Promise<CrossCompanyInventoryTransferPreview> {
    const decoded = await this.rpc("preview_native_cross_company_inventory_transfer", previewArgs(command), previewSchema);
    return { ...decoded, sourceCompanyId: companyId(decoded.sourceCompanyId), destinationCompanyId: companyId(decoded.destinationCompanyId) };
  }

  /** {@inheritDoc CrossCompanyInventoryTransferRepository.execute} */
  async execute(command: ExecuteCrossCompanyInventoryTransferCommand): Promise<CrossCompanyInventoryTransferReceipt> {
    const decoded = await this.rpc("execute_native_cross_company_inventory_transfer", {
      ...previewArgs(command),
      p_transfer_id: command.transferId,
      p_correlation_id: command.correlationId,
      p_idempotency_key: command.idempotencyKey,
      p_reference: command.reference,
      p_notes: command.notes,
      p_expected_source_snapshot_token: command.expectedSourceSnapshotToken,
      p_expected_destination_snapshot_token: command.expectedDestinationSnapshotToken,
    }, receiptSchema);
    return {
      ...decoded,
      transferId: crossCompanyInventoryTransferId(decoded.transferId),
      sourceCompanyId: companyId(decoded.sourceCompanyId),
      destinationCompanyId: companyId(decoded.destinationCompanyId),
    };
  }

  private async rpc<TSchema extends z.ZodType>(
    name: "preview_native_cross_company_inventory_transfer" | "execute_native_cross_company_inventory_transfer" | "preview_native_cross_company_inventory_compensation" | "execute_native_cross_company_inventory_compensation",
    args: Record<string, unknown>,
    schema: TSchema,
  ): Promise<z.infer<TSchema>> {
    try {
      const { data, error } = await this.client.rpc(name, args);
      if (error) throw failure(error);
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        throw new InventoryFailure("INVENTORY_REPOSITORY_UNAVAILABLE", "Cross-company inventory transfer returned invalid data.", { cause: parsed.error });
      }
      return parsed.data;
    } catch (cause: unknown) {
      if (cause instanceof InventoryFailure) throw cause;
      throw new InventoryFailure("INVENTORY_REPOSITORY_UNAVAILABLE", "Cross-company inventory transfer repository is unavailable.", { cause });
    }
  }
}

/** Server-only Supabase RPC adapter for immutable physical compensation of one original transfer. */
export class SupabaseCrossCompanyInventoryCompensationRepository implements CrossCompanyInventoryCompensationRepository {
  /** @param client - Trusted server Supabase client used only for compensation RPCs. */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc CrossCompanyInventoryCompensationRepository.preview} */
  async preview(command: PreviewCrossCompanyInventoryCompensationCommand): Promise<CrossCompanyInventoryCompensationPreview> {
    const decoded = await compensationRpc(this.client, "preview_native_cross_company_inventory_compensation", compensationPreviewArgs(command), compensationPreviewSchema);
    return { ...decoded, originalTransferId: crossCompanyInventoryTransferId(decoded.originalTransferId), sourceCompanyId: companyId(decoded.sourceCompanyId), destinationCompanyId: companyId(decoded.destinationCompanyId), lines: decodeCompensationLines(decoded.lines) };
  }

  /** {@inheritDoc CrossCompanyInventoryCompensationRepository.execute} */
  async execute(command: ExecuteCrossCompanyInventoryCompensationCommand): Promise<CrossCompanyInventoryCompensationReceipt> {
    const decoded = await compensationRpc(this.client, "execute_native_cross_company_inventory_compensation", { ...compensationPreviewArgs(command), p_compensation_transfer_id: command.compensationTransferId, p_idempotency_key: command.idempotencyKey, p_reason: command.reason, p_expected_source_snapshot_token: command.expectedSourceSnapshotToken, p_expected_destination_snapshot_token: command.expectedDestinationSnapshotToken }, compensationReceiptSchema);
    return { ...decoded, originalTransferId: crossCompanyInventoryTransferId(decoded.originalTransferId), compensationTransferId: crossCompanyInventoryTransferId(decoded.compensationTransferId), sourceCompanyId: companyId(decoded.sourceCompanyId), destinationCompanyId: companyId(decoded.destinationCompanyId) };
  }
}

async function compensationRpc<TSchema extends z.ZodType>(client: SupabaseClient, name: "preview_native_cross_company_inventory_compensation" | "execute_native_cross_company_inventory_compensation", args: Record<string, unknown>, schema: TSchema): Promise<z.infer<TSchema>> {
  try { const { data, error } = await client.rpc(name, args); if (error) throw failure(error); const parsed = schema.safeParse(data); if (!parsed.success) throw new InventoryFailure("INVENTORY_REPOSITORY_UNAVAILABLE", "Cross-company inventory compensation returned invalid data.", { cause: parsed.error }); return parsed.data; } catch (cause: unknown) { if (cause instanceof InventoryFailure) throw cause; throw new InventoryFailure("INVENTORY_REPOSITORY_UNAVAILABLE", "Cross-company inventory compensation repository is unavailable.", { cause }); }
}

function decodeCompensationLines(value: readonly { readonly sourceProductId: string; readonly destinationProductId: string; readonly quantity: string; readonly unit: string }[]): readonly CrossCompanyInventoryCompensationPreview["lines"][number][] {
  return value.map((line) => {
    if (!Object.values(UnitOfMeasure).includes(line.unit as UnitOfMeasure)) throw new InventoryFailure("INVENTORY_REPOSITORY_UNAVAILABLE", "Cross-company inventory compensation returned an invalid unit.");
    return { sourceProductId: productId(line.sourceProductId), destinationProductId: productId(line.destinationProductId), quantity: line.quantity, unit: line.unit as UnitOfMeasure };
  });
}

function previewArgs(command: PreviewCrossCompanyInventoryTransferCommand): Record<string, unknown> {
  return {
    p_actor_user_id: command.actorUserId,
    p_organization_id: command.organizationId,
    p_source_company_id: command.sourceCompanyId,
    p_destination_company_id: command.destinationCompanyId,
    p_effective_date: command.effectiveDate,
    p_lines: command.lines.map((line) => ({
      sourceProductId: line.sourceProductId,
      destinationProductId: line.destinationProductId,
      quantity: line.quantity,
      unit: line.unit,
    })),
  };
}

function compensationPreviewArgs(command: PreviewCrossCompanyInventoryCompensationCommand): Record<string, unknown> {
  return { p_actor_user_id: command.actorUserId, p_organization_id: command.organizationId, p_original_transfer_id: command.originalTransferId, p_effective_date: command.effectiveDate };
}

function failure(error: { readonly message: string }): InventoryFailure {
  const codes = [
    "INVENTORY_CROSS_COMPANY_COMPENSATION_INVALID",
    "INVENTORY_CROSS_COMPANY_COMPENSATION_NOT_FOUND",
    "INVENTORY_CROSS_COMPANY_COMPENSATION_ALREADY_COMPENSATED",
    "INVENTORY_CROSS_COMPANY_COMPENSATION_IDEMPOTENCY_CONFLICT",
    "INVENTORY_CROSS_COMPANY_TRANSFER_INVALID",
    "INVENTORY_CROSS_COMPANY_TRANSFER_COMPANY_INVALID",
    "INVENTORY_CROSS_COMPANY_TRANSFER_PERIOD_CLOSED",
    "INVENTORY_CROSS_COMPANY_TRANSFER_PRODUCT_INVALID",
    "INVENTORY_CROSS_COMPANY_TRANSFER_STOCK_INVALID",
    "INVENTORY_CROSS_COMPANY_TRANSFER_SNAPSHOT_CONFLICT",
    "INVENTORY_CROSS_COMPANY_TRANSFER_VALUATION_CONFLICT",
    "INVENTORY_CROSS_COMPANY_TRANSFER_IDEMPOTENCY_CONFLICT",
    "INVENTORY_CROSS_COMPANY_TRANSFER_IMMUTABLE",
  ] as const;
  const code = codes.find((candidate) => error.message.includes(candidate));
  if (code !== undefined) return new InventoryFailure(code, safeMessage(code), { cause: error });
  if (error.message.includes("ORGANIZATIONAL_USER_ACCESS_DENIED")) {
    return new InventoryFailure("INVENTORY_OPERATION_ACCESS_DENIED", "Inventory transfer access was denied.", { cause: error });
  }
  if (error.message.includes("ORGANIZATIONAL_USER_COMPANY_INVALID")) {
    return new InventoryFailure("INVENTORY_CROSS_COMPANY_TRANSFER_COMPANY_INVALID", "The inventory transfer company scope is invalid.", { cause: error });
  }
  return new InventoryFailure("INVENTORY_REPOSITORY_UNAVAILABLE", "Cross-company inventory transfer is unavailable.", { cause: error });
}

function safeMessage(code: InventoryFailure["code"]): string {
  return `Cross-company inventory transfer failed: ${code}.`;
}
