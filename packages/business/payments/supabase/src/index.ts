import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { money } from "@kontave/billing-domain";
import { organizationId, type OrganizationId } from "@kontave/organizations/domain";
import type { PaymentEventOutbox, PaymentsRepository } from "@kontave/payments-application";
import { PaymentFailure, type Payment, type PaymentConfirmed } from "@kontave/payments-domain";
import { confirmedPaymentResultSchema, paymentRowSchema } from "./persistence-codecs";

/** Credentials required by the server-side payments adapters. */
export interface PaymentsSupabaseConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/**
 * Creates payment and outbox adapters sharing one stateless Supabase client.
 *
 * @param configuration - Supabase endpoint and service-role credential.
 * @returns Infrastructure adapters for the payments capability.
 * @throws When the Supabase client rejects invalid construction parameters.
 */
export function createPaymentsInfrastructure(configuration: PaymentsSupabaseConfiguration): {
  repository: PaymentsRepository;
  outbox: PaymentEventOutbox;
} {
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    repository: new SupabasePaymentsRepository(client),
    outbox: new SupabasePaymentEventOutbox(client),
  };
}

class SupabasePaymentsRepository implements PaymentsRepository {
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc PaymentsRepository.list} */
  async list(id: OrganizationId): Promise<readonly Payment[]> {
    return boundary(async () => {
      const { data, error } = await this.client
        .from("organization_payments")
        .select("*")
        .eq("organization_id", id)
        .order("created_at", { ascending: false });
      if (error) throw repositoryFailure(error);
      const decoded = paymentRowSchema.array().safeParse(data ?? []);
      if (!decoded.success) throw repositoryFailure(decoded.error);
      return decoded.data.map(mapPayment);
    });
  }

  /** {@inheritDoc PaymentsRepository.confirm} */
  async confirm(
    input: Parameters<PaymentsRepository["confirm"]>[0],
  ): Promise<{ payment: Payment; event: PaymentConfirmed }> {
    return boundary(async () => {
      const { data, error } = await this.client.rpc("confirm_organization_payment", {
        p_organization_id: input.organizationId,
        p_invoice_id: input.invoiceId,
        p_provider: input.provider,
        p_provider_reference: input.providerReference,
        p_amount_minor: input.amount.minorAmount.toString(),
        p_currency: input.amount.currency,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      if (error) throw mapPaymentError(error);
      const decoded = confirmedPaymentResultSchema.safeParse(data);
      if (!decoded.success) throw repositoryFailure(decoded.error);
      const row = decoded.data;
      return {
        payment: mapPayment(row.payment),
        event: {
          id: row.event.id,
          type: row.event.type,
          paymentId: row.event.paymentId,
          organizationId: organizationId(row.event.organizationId),
          invoiceId: row.event.invoiceId,
          amount: money(BigInt(row.event.amountMinor), row.event.currency),
          isFirstPaidInvoice: row.event.isFirstPaidInvoice,
          occurredAt: row.event.occurredAt,
        },
      };
    });
  }
}

class SupabasePaymentEventOutbox implements PaymentEventOutbox {
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc PaymentEventOutbox.markProcessed} */
  async markProcessed(eventId: string, processedAt: string): Promise<void> {
    await boundary(async () => {
      const { error } = await this.client.rpc("mark_organization_outbox_processed", {
        p_event_id: eventId,
        p_processed_at: processedAt,
      });
      if (error) throw repositoryFailure(error);
    });
  }
}

function mapPayment(row: ReturnType<typeof paymentRowSchema.parse>): Payment {
  return {
    id: row.id,
    organizationId: organizationId(row.organization_id),
    invoiceId: row.invoice_id,
    provider: row.provider,
    providerReference: row.provider_reference,
    amount: money(BigInt(row.amount_minor), row.currency),
    status: row.status,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
  };
}

async function boundary<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof PaymentFailure) throw cause;
    throw repositoryFailure(cause);
  }
}

function repositoryFailure(cause: unknown): PaymentFailure {
  return new PaymentFailure("PAYMENT_REPOSITORY_UNAVAILABLE", "No se pudo acceder a los pagos.", { cause });
}

function mapPaymentError(error: { message?: string }): PaymentFailure {
  const message = error.message ?? "";
  if (message.includes("invoice_not_payable")) {
    return new PaymentFailure("PAYMENT_INVOICE_NOT_PAYABLE", "La factura no admite pagos.");
  }
  if (message.includes("currency_mismatch")) {
    return new PaymentFailure("PAYMENT_CURRENCY_MISMATCH", "La moneda del pago no coincide con la factura.");
  }
  if (message.includes("payment_amount_invalid")) {
    return new PaymentFailure("PAYMENT_AMOUNT_INVALID", "El monto no coincide con el saldo de la factura.");
  }
  return repositoryFailure(error);
}
