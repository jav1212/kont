import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  SecuredSales,
  type SecuredSalesRepository,
  type SecuredSalesScope,
} from "../../application/secured-sales";
import { SalesFailure } from "../../domain";

const creditLimit = z.object({
  companyId: z.string().min(1),
  customerId: z.string().min(1),
  limitVes: z.string().regex(/^\d+(\.\d{1,8})?$/),
  version: z.number().int().positive(),
});
const confirmation = z.object({
  companyId: z.string().min(1),
  invoiceId: z.string().min(1),
  status: z.literal("confirmed"),
});
const reversal = z.object({
  id: z.string().min(1),
  companyId: z.string().min(1),
  paymentId: z.string().min(1),
  receivableId: z.string().min(1),
  reason: z.string().min(1),
  actorId: z.string().min(1),
  occurredAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  replayed: z.boolean(),
});

/** Supabase implementation of secured commercial transactions from migration 294. */
export class SupabaseSecuredSalesRepository implements SecuredSalesRepository {
  /**
   * Creates a server-only adapter; the supplied service client must never be exposed to a renderer.
   * @param client - Trusted Supabase service client.
   * @returns A transaction-backed commercial repository.
   */
  constructor(private readonly client: SupabaseClient) {}
  /** {@inheritDoc SecuredSalesRepository.confirm} */
  async confirm(input: Parameters<SecuredSalesRepository["confirm"]>[0]) {
    const data = await this.call(input.companyBranchId ? "confirm_native_sales_invoice_branch_secure" : input.salesRegisterId ? "confirm_web_sales_invoice_secure" : "confirm_native_sales_invoice_secure", {
      ...scope(input),
      p_invoice_id: input.invoiceId,
      p_allow_negative_stock: input.allowNegativeStock,
      p_price_list_id: input.priceListId ?? null,
      ...(input.companyBranchId ? { p_company_branch_id: input.companyBranchId } : {}),
      ...(input.salesRegisterId ? { p_sales_register_id: input.salesRegisterId } : {}),
      p_branch_id: input.branchId ?? input.companyBranchId ?? null,
      p_device_id: input.deviceId ?? null,
    });
    const parsed = confirmation.safeParse(data);
    if (
      !parsed.success ||
      parsed.data.companyId !== input.companyId ||
      parsed.data.invoiceId !== input.invoiceId
    )
      throw unavailable();
    return parsed.data;
  }
  /** {@inheritDoc SecuredSalesRepository.reversePayment} */
  async reversePayment(
    input: Parameters<SecuredSalesRepository["reversePayment"]>[0],
  ) {
    const data = await this.call("reverse_native_receivable_payment", {
      ...scope(input),
      p_receivable_id: input.receivableId,
      p_payment_id: input.paymentId,
      p_idempotency_key: input.idempotencyKey,
      p_reason: input.reason,
      p_branch_id: input.branchId ?? null,
      p_device_id: input.deviceId ?? null,
    });
    const parsed = reversal.safeParse(data);
    if (
      !parsed.success ||
      parsed.data.companyId !== input.companyId ||
      parsed.data.paymentId !== input.paymentId ||
      parsed.data.receivableId !== input.receivableId ||
      parsed.data.actorId !== input.actorUserId
    )
      throw unavailable();
    return parsed.data;
  }
  /** {@inheritDoc SecuredSalesRepository.getCreditLimit} */
  async getCreditLimit(
    input: Parameters<SecuredSalesRepository["getCreditLimit"]>[0],
  ) {
    const data = await this.call("get_native_customer_credit_limit", {
      ...scope(input),
      p_customer_id: input.customerId,
    });
    if (data === null) return null;
    return decodeLimit(data, input);
  }
  /** {@inheritDoc SecuredSalesRepository.setCreditLimit} */
  async setCreditLimit(
    input: Parameters<SecuredSalesRepository["setCreditLimit"]>[0],
  ) {
    const data = await this.call("set_native_customer_credit_limit", {
      ...scope(input),
      p_customer_id: input.customerId,
      p_limit_ves: input.limitVes,
      p_expected_version: input.expectedVersion,
    });
    return decodeLimit(data, input);
  }
  private async call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const { data, error } = await this.client.rpc(name, args);
      if (error) throw rpcFailure(error.message);
      return data;
    } catch (cause) {
      if (cause instanceof SalesFailure) throw cause;
      throw unavailable(cause);
    }
  }
}

/**
 * Composes the package's production commercial security entrypoints.
 * @param client - Server-only Supabase client with access to the security RPCs.
 * @returns An application service with enforced persistent checks.
 */
export function createSupabaseSecuredSales(
  client: SupabaseClient,
): SecuredSales {
  return new SecuredSales(new SupabaseSecuredSalesRepository(client));
}

function scope(input: SecuredSalesScope): Record<string, string> {
  return {
    p_actor_user_id: input.actorUserId,
    p_organization_id: input.organizationId,
    p_company_id: input.companyId,
  };
}
function decodeLimit(
  data: unknown,
  input: SecuredSalesScope & { readonly customerId: string },
) {
  const parsed = creditLimit.safeParse(data);
  if (
    !parsed.success ||
    parsed.data.companyId !== input.companyId ||
    parsed.data.customerId !== input.customerId
  )
    throw unavailable();
  return parsed.data;
}
function unavailable(cause?: unknown): SalesFailure {
  return new SalesFailure(
    "SALES_REPOSITORY_UNAVAILABLE",
    "Commercial security persistence is unavailable or returned invalid data.",
    { cause },
  );
}
function rpcFailure(message: string): SalesFailure {
  for (const code of [
    "SALES_NOT_FOUND",
    "SALES_CREDIT_INVALID",
    "SALES_CONCURRENCY_CONFLICT",
    "SALES_RECEIVABLE_PAYMENT_INVALID",
    "SALES_RECEIVABLE_IDEMPOTENCY_CONFLICT",
    "SALES_ORDER_TRANSITION_INVALID",
    "SALES_BRANCH_INVALID",
    "SALES_BRANCH_NOT_FOUND",
    "SALES_BRANCH_IMMUTABLE",
    "SALES_BRANCH_ACCESS_DENIED",
  ] as const)
    if (message.includes(code))
      return new SalesFailure(code, "Commercial transaction was rejected.");
  if (/ACCESS_DENIED|PERMISSION|FORBIDDEN|UNAUTHORIZED/.test(message))
    return new SalesFailure(
      "SALES_ACCESS_DENIED",
      "Commercial operation is not authorized.",
    );
  return unavailable();
}
