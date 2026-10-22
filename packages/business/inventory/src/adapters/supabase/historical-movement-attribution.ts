import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  freezeHistoricalInventoryMovementAttribution,
  freezeHistoricalInventoryMovementAttributionCandidate,
  HistoricalInventoryMovementAttributionFailure,
  type AttributeHistoricalInventoryMovementCommand,
  type GetHistoricalInventoryMovementAttributionCandidateQuery,
  type HistoricalInventoryMovementAttribution,
  type HistoricalInventoryMovementAttributionCandidate,
  type HistoricalInventoryMovementAttributionCandidateReader,
  type HistoricalInventoryMovementAttributionWriter,
} from "../../application";

const decimal = z.string();
const candidateSchema = z.object({
  movementId: z.string().min(1), companyId: z.string().min(1), productId: z.string().min(1), type: z.enum(["entrada", "salida", "ajuste_positivo", "ajuste_negativo", "devolucion_entrada", "devolucion_salida", "autoconsumo"]), date: z.string().date(),
  quantity: decimal, unit: z.string().min(1), unitCostVes: decimal, totalCostVes: decimal, reference: z.string().nullable(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/), attributedBranchId: z.string().uuid().nullable(),
});
const attributionSchema = z.object({
  movementId: z.string().min(1), companyId: z.string().min(1), branchId: z.string().uuid(), productId: z.string().min(1), type: z.enum(["entrada", "salida", "ajuste_positivo", "ajuste_negativo", "devolucion_entrada", "devolucion_salida", "autoconsumo"]), date: z.string().date(),
  quantity: decimal, unit: z.string().min(1), unitCostVes: decimal, totalCostVes: decimal,
  attributedAt: z.string().datetime({ offset: true }), attributedBy: z.string().uuid(), reason: z.string().min(10).max(500),
});

/** Server-only adapter that previews and attributes independent historical inventory movements through RPCs. */
export class SupabaseHistoricalInventoryMovementAttributionRepository implements HistoricalInventoryMovementAttributionCandidateReader, HistoricalInventoryMovementAttributionWriter {
  /**
   * @param client - Trusted Supabase client used exclusively through the historical-attribution RPCs.
   * @returns A tenant-aware historical-attribution repository.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc HistoricalInventoryMovementAttributionCandidateReader.get} */
  async get(query: GetHistoricalInventoryMovementAttributionCandidateQuery): Promise<HistoricalInventoryMovementAttributionCandidate> {
    try {
      const { data, error } = await this.client.rpc("get_native_inventory_historical_movement_attribution_candidate", {
        p_actor_user_id: query.actorUserId,
        p_organization_id: query.organizationId,
        p_company_id: query.companyId,
        p_movement_id: query.movementId,
      });
      if (error) throw mapError(error);
      const parsed = candidateSchema.safeParse(data);
      if (!parsed.success) throw unavailable("Historical movement candidate returned invalid data.", parsed.error);
      try {
        const candidate = freezeHistoricalInventoryMovementAttributionCandidate(parsed.data as HistoricalInventoryMovementAttributionCandidate);
        if (candidate.companyId !== query.companyId || candidate.movementId !== query.movementId) {
          throw unavailable("Historical movement candidate returned another movement.", candidate);
        }
        return candidate;
      } catch (cause: unknown) {
        if (cause instanceof HistoricalInventoryMovementAttributionFailure && cause.code === "INVENTORY_BRANCH_ATTRIBUTION_UNAVAILABLE") throw cause;
        throw unavailable("Historical movement candidate returned inconsistent data.", cause);
      }
    } catch (cause: unknown) {
      if (cause instanceof HistoricalInventoryMovementAttributionFailure) throw cause;
      throw unavailable("Historical movement candidate is unavailable.", cause);
    }
  }

  /** {@inheritDoc HistoricalInventoryMovementAttributionWriter.attribute} */
  async attribute(command: AttributeHistoricalInventoryMovementCommand): Promise<HistoricalInventoryMovementAttribution> {
    try {
      const { data, error } = await this.client.rpc("attribute_native_inventory_historical_movement", {
        p_actor_user_id: command.actorUserId,
        p_organization_id: command.organizationId,
        p_company_id: command.companyId,
        p_movement_id: command.movementId,
        p_branch_id: command.branchId,
        p_expected_movement_fingerprint: command.expectedMovementFingerprint,
        p_reason: command.reason,
        p_idempotency_key: command.idempotencyKey,
      });
      if (error) throw mapError(error);
      const parsed = attributionSchema.safeParse(data);
      if (!parsed.success) throw unavailable("Historical movement attribution returned invalid data.", parsed.error);
      try {
        const attribution = freezeHistoricalInventoryMovementAttribution(parsed.data as HistoricalInventoryMovementAttribution);
        verifyAttributionMatchesCommand(attribution, command);
        return attribution;
      } catch (cause: unknown) {
        if (cause instanceof HistoricalInventoryMovementAttributionFailure && cause.code === "INVENTORY_BRANCH_ATTRIBUTION_UNAVAILABLE") throw cause;
        throw unavailable("Historical movement attribution returned inconsistent data.", cause);
      }
    } catch (cause: unknown) {
      if (cause instanceof HistoricalInventoryMovementAttributionFailure) throw cause;
      throw unavailable("Historical movement attribution is unavailable.", cause);
    }
  }
}

/** Rejects a valid-looking write payload that belongs to another reviewed request. */
function verifyAttributionMatchesCommand(
  attribution: HistoricalInventoryMovementAttribution,
  command: AttributeHistoricalInventoryMovementCommand,
): void {
  if (
    attribution.movementId !== command.movementId
    || attribution.companyId !== command.companyId
    || attribution.branchId !== command.branchId
    || attribution.attributedBy !== command.actorUserId
    || attribution.reason !== command.reason
  ) throw unavailable("Historical movement attribution returned another operation.", attribution);
}

function mapError(error: { message: string }): HistoricalInventoryMovementAttributionFailure {
  for (const code of [
    "INVENTORY_BRANCH_ATTRIBUTION_INVALID",
    "INVENTORY_BRANCH_ATTRIBUTION_ACCESS_DENIED",
    "INVENTORY_BRANCH_ATTRIBUTION_MOVEMENT_UNAVAILABLE",
    "INVENTORY_BRANCH_ATTRIBUTION_ALREADY_ATTRIBUTED",
    "INVENTORY_BRANCH_ATTRIBUTION_STALE",
    "INVENTORY_BRANCH_ATTRIBUTION_IDEMPOTENCY_CONFLICT",
  ] as const) {
    if (error.message.includes(code)) return new HistoricalInventoryMovementAttributionFailure(code, messageFor(code), { cause: error });
  }
  return unavailable("Historical movement attribution is unavailable.", error);
}

function messageFor(code: Exclude<HistoricalInventoryMovementAttributionFailure["code"], "INVENTORY_BRANCH_ATTRIBUTION_UNAVAILABLE">): string {
  const messages: Readonly<Record<Exclude<HistoricalInventoryMovementAttributionFailure["code"], "INVENTORY_BRANCH_ATTRIBUTION_UNAVAILABLE">, string>> = {
    INVENTORY_BRANCH_ATTRIBUTION_INVALID: "Historical inventory movement attribution is invalid.",
    INVENTORY_BRANCH_ATTRIBUTION_ACCESS_DENIED: "Historical inventory movement attribution access was denied.",
    INVENTORY_BRANCH_ATTRIBUTION_MOVEMENT_UNAVAILABLE: "Historical inventory movement is unavailable for attribution.",
    INVENTORY_BRANCH_ATTRIBUTION_ALREADY_ATTRIBUTED: "Historical inventory movement is already attributed.",
    INVENTORY_BRANCH_ATTRIBUTION_STALE: "Historical inventory movement changed after review.",
    INVENTORY_BRANCH_ATTRIBUTION_IDEMPOTENCY_CONFLICT: "Historical inventory movement attribution idempotency key conflicts with another request.",
  };
  return messages[code];
}

function unavailable(message: string, cause: unknown): HistoricalInventoryMovementAttributionFailure {
  return new HistoricalInventoryMovementAttributionFailure("INVENTORY_BRANCH_ATTRIBUTION_UNAVAILABLE", message, { cause });
}
