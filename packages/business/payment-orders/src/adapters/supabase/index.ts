import {
  PaymentOrderFailure,
  paymentOrderAmount,
  paymentOrderDate,
  type PaymentOrder,
} from "../../domain";
import type {
  CreatePaymentOrder,
  GetPaymentOrder,
  PaymentOrderRepository,
  UpdatePaymentOrder,
  VersionedPaymentOrder,
} from "../../application";

/** Minimal service-side RPC transport. The caller supplies the authenticated actor identity separately. */
export interface PaymentOrderSource {
  /**
   * Calls a service-side payment-order RPC.
   * @param name - Database RPC name.
   * @param values - Database RPC arguments.
   * @returns Awaitable RPC result or transport error.
   */ rpc(
    name: string,
    values: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
}
/** Supabase adapter for service-only, authorization-enforcing payment-order RPCs. */
export class SupabasePaymentOrderRepository implements PaymentOrderRepository {
  /**
   * Creates the service-only payment-order adapter.
   * @param source - Service-side RPC transport.
   * @returns A repository that delegates authorization to SQL RPCs.
   */ public constructor(
    private readonly source: PaymentOrderSource,
  ) {}
  /** {@inheritDoc PaymentOrderRepository.create} */ public create(
    input: CreatePaymentOrder,
  ): Promise<PaymentOrder> {
    return this.call("create_payment_order", createArguments(input), input);
  }
  /** {@inheritDoc PaymentOrderRepository.update} */ public update(
    input: UpdatePaymentOrder,
  ): Promise<PaymentOrder> {
    return this.call("update_payment_order", updateArguments(input), input);
  }
  /** {@inheritDoc PaymentOrderRepository.cancel} */ public cancel(
    input: VersionedPaymentOrder,
  ): Promise<PaymentOrder> {
    return this.call("cancel_payment_order", scopeArguments(input), input);
  }
  /** {@inheritDoc PaymentOrderRepository.delete} */ public async delete(
    input: VersionedPaymentOrder,
  ): Promise<void> {
    const result = await this.request(
      "delete_payment_order",
      scopeArguments(input),
    );
    if (result.error) throw failure(result.error);
  }
  /** {@inheritDoc PaymentOrderRepository.get} */ public get(
    input: GetPaymentOrder,
  ): Promise<PaymentOrder> {
    return this.call("get_payment_order", getArguments(input), input);
  }
  private async call(
    name: string,
    values: Record<string, unknown>,
    scope: { organizationId: string; companyId: string; id: string },
  ): Promise<PaymentOrder> {
    const result = await this.request(name, values);
    if (result.error) throw failure(result.error);
    return decode(result.data, scope);
  }
  private async request(name: string, values: Record<string, unknown>) {
    try {
      return await this.source.rpc(name, values);
    } catch {
      throw new PaymentOrderFailure(
        "UNAVAILABLE",
        "Payment-order persistence is unavailable.",
      );
    }
  }
}
function createArguments(input: CreatePaymentOrder): Record<string, unknown> {
  return {
    p_actor_id: input.actorId,
    p_organization_id: input.organizationId,
    p_company_id: input.companyId,
    p_id: input.id,
    p_beneficiary: input.beneficiary,
    p_concept: input.concept,
    p_amount: input.amount,
    p_currency: input.currency,
    p_due_date: input.dueDate,
    p_branch_id: input.branchId ?? null,
    p_device_id: input.deviceId ?? null,
  };
}
function updateArguments(input: UpdatePaymentOrder): Record<string, unknown> {
  return {
    ...scopeArguments(input),
    p_beneficiary: input.beneficiary ?? null,
    p_concept: input.concept ?? null,
    p_amount: input.amount ?? null,
    p_currency: input.currency ?? null,
    p_due_date: input.dueDate ?? null,
    p_due_date_set: Object.hasOwn(input, "dueDate"),
  };
}
function getArguments(input: GetPaymentOrder): Record<string, unknown> {
  return {
    p_actor_id: input.actorId,
    p_organization_id: input.organizationId,
    p_company_id: input.companyId,
    p_id: input.id,
  };
}
function scopeArguments(input: VersionedPaymentOrder): Record<string, unknown> {
  return {
    p_actor_id: input.actorId,
    p_organization_id: input.organizationId,
    p_company_id: input.companyId,
    p_id: input.id,
    p_expected_version: input.expectedVersion,
    p_branch_id: input.branchId ?? null,
    p_device_id: input.deviceId ?? null,
  };
}
function decode(
  value: unknown,
  scope: { organizationId: string; companyId: string; id: string },
): PaymentOrder {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new PaymentOrderFailure(
      "UNAVAILABLE",
      "Malformed payment-order response.",
    );
  const row = value as Record<string, unknown>;
  const version = row.version;
  if (
    row.id !== scope.id ||
    row.organization_id !== scope.organizationId ||
    row.company_id !== scope.companyId ||
    typeof row.tenant_id !== "string" ||
    typeof row.beneficiary !== "string" ||
    typeof row.concept !== "string" ||
    typeof row.amount !== "string" ||
    typeof row.currency !== "string" ||
    !/^[A-Z]{3}$/.test(row.currency) ||
    (row.due_date !== null && typeof row.due_date !== "string") ||
    (row.status !== "draft" && row.status !== "cancelled") ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1
  )
    throw new PaymentOrderFailure(
      "UNAVAILABLE",
      "Malformed or out-of-scope payment-order response.",
    );
  try {
    paymentOrderAmount(row.amount);
    paymentOrderDate(row.due_date);
    if (
      !row.tenant_id.trim() ||
      !row.beneficiary.trim() ||
      row.beneficiary.length > 240 ||
      !row.concept.trim() ||
      row.concept.length > 1000
    )
      throw new Error("Invalid persisted fields");
  } catch {
    throw new PaymentOrderFailure(
      "UNAVAILABLE",
      "Malformed payment-order values.",
    );
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    companyId: row.company_id,
    beneficiary: row.beneficiary,
    concept: row.concept,
    amount: row.amount,
    currency: row.currency,
    dueDate: row.due_date,
    status: row.status,
    version,
  };
}
function failure(error: {
  message?: string;
  code?: string;
}): PaymentOrderFailure {
  const text = error.message ?? "Payment order unavailable.";
  if (/ACCESS_DENIED|COMPANY_INVALID|permission denied/i.test(text))
    return new PaymentOrderFailure("FORBIDDEN", text);
  if (/CONFLICT|NOT_FOUND|CANCELLED/i.test(text))
    return new PaymentOrderFailure(
      /NOT_FOUND/.test(text) ? "NOT_FOUND" : "CONFLICT",
      text,
    );
  if (/INVALID/i.test(text)) return new PaymentOrderFailure("INVALID", text);
  return new PaymentOrderFailure("UNAVAILABLE", text);
}
