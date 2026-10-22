import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type {
  OfflineDraftPayloadBinding,
  OfflineSalesDraftGateway,
  OfflineSalesDraftSessionActorResolver,
} from "../../application";
import type { OfflineSalesDraftSettlement } from "../../domain";
import { offlineSalesOrderDraftIntentV1 } from "../../domain";
import type { OfflineDraftJson } from "../../domain";

const response = z.object({ draftId: z.string().min(1).max(128), replayed: z.boolean() });

/** Server-only Supabase gateway that accepts only version-one offline merchandise-order drafts. */
export class SupabaseOfflineSalesOrderDraftGateway implements OfflineSalesDraftGateway {
  /**
   * @param client - Server-only client authorized to invoke the draft RPC.
   * @param sessionActors - Trusted current-session actor resolver; queued outbox metadata is never authentication evidence.
   * @returns Gateway that creates server drafts without issuing invoices or inventory movements.
   */
  constructor(
    private readonly client: SupabaseClient,
    private readonly sessionActors: OfflineSalesDraftSessionActorResolver,
  ) {}

  /** {@inheritDoc OfflineSalesDraftGateway.createDraft} */
  async createDraft(
    input: OfflineDraftPayloadBinding & { readonly payload: OfflineDraftJson },
  ): Promise<OfflineSalesDraftSettlement> {
    const payload = parsePayload(input.payload);
    if (payload === null || !validBinding(input)) return { kind: "rejected", code: "validation_failed" };
    let trustedActor;
    try {
      trustedActor = await this.sessionActors.resolveActorUserId();
    } catch {
      return { kind: "retry" };
    }
    if (trustedActor === null || trustedActor.toLowerCase() !== input.actorUserId.toLowerCase()) {
      return { kind: "blocked", code: "authorization_revoked" };
    }
    try {
      const { data, error } = await this.client.rpc("create_native_offline_sales_order_draft", {
        p_actor_user_id: trustedActor,
        p_organization_id: input.organizationId,
        p_company_id: input.companyId,
        p_branch_id: input.branchId,
        p_operation_id: input.operationId,
        p_payload: payload,
      });
      if (error) return mapRpcError(error.message);
      const parsed = response.safeParse(data);
      return parsed.success && parsed.data.draftId === input.operationId
        ? { kind: "synced", serverDraftId: parsed.data.draftId }
        : { kind: "retry" };
    } catch {
      return { kind: "retry" };
    }
  }
}

function parsePayload(value: OfflineDraftJson) {
  try { return offlineSalesOrderDraftIntentV1(value); }
  catch { return null; }
}

function validBinding(value: OfflineDraftPayloadBinding): boolean {
  return typeof value.operationId === "string" && typeof value.actorUserId === "string"
    && typeof value.organizationId === "string" && typeof value.branchId === "string"
    && typeof value.companyId === "string" && isUuid(value.operationId) && isUuid(value.actorUserId)
    && isUuid(value.organizationId) && isUuid(value.branchId) && !!value.companyId.trim()
    && value.companyId.length <= 128;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function mapRpcError(message: string): OfflineSalesDraftSettlement {
  if (message.includes("SALES_OFFLINE_DRAFT_AUTHORIZATION_REVOKED") || message.includes("ORGANIZATIONAL_USER_ACCESS_DENIED") || message.includes("ORGANIZATIONAL_USER_COMPANY_INVALID")) return { kind: "blocked", code: "authorization_revoked" };
  if (message.includes("SALES_OFFLINE_DRAFT_BRANCH_UNAVAILABLE")) return { kind: "blocked", code: "branch_unavailable" };
  if (message.includes("SALES_OFFLINE_DRAFT_SOURCE_CHANGED")) return { kind: "blocked", code: "source_changed" };
  if (message.includes("SALES_OFFLINE_DRAFT_VALIDATION_FAILED")) return { kind: "rejected", code: "validation_failed" };
  if (message.includes("SALES_OFFLINE_DRAFT_IDEMPOTENCY_CONFLICT")) return { kind: "rejected", code: "idempotency_conflict" };
  return { kind: "retry" };
}
