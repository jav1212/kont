import type { Money } from "@kontave/billing-domain";
import type { OrganizationId } from "@kontave/organizations/domain";
import {
  PaymentFailure,
  type Payment,
  type PaymentConfirmed,
  type PaymentProvider,
} from "@kontave/payments-domain";

/** Input required to confirm an invoice payment idempotently. */
export interface ConfirmPaymentInput {
  readonly organizationId: OrganizationId;
  readonly invoiceId: string;
  readonly provider: PaymentProvider;
  readonly providerReference: string;
  readonly amount: Money;
  readonly occurredAt: string;
  readonly idempotencyKey: string;
}

/** Persistence port owned by the payments application layer. */
export interface PaymentsRepository {
  /** @returns Payments owned by the organization, newest first when supported. */
  list(organizationId: OrganizationId): Promise<readonly Payment[]>;
  /** @returns The confirmed payment and atomically persisted outbox event. */
  confirm(input: ConfirmPaymentInput): Promise<{ payment: Payment; event: PaymentConfirmed }>;
}

/** Port for acknowledging payment events after downstream processing. */
export interface PaymentEventOutbox {
  /** @returns A promise completed after the event is marked as processed. */
  markProcessed(eventId: string, processedAt: string): Promise<void>;
}

/** Lists payments owned by an organization. */
export class ListPayments {
  /** @param repository - Payments persistence port. */
  constructor(private readonly repository: PaymentsRepository) {}

  /**
   * @param organizationId - Organization whose payments are requested.
   * @returns Matching payments.
   * @throws {PaymentFailure} When persistence is unavailable.
   */
  execute(organizationId: OrganizationId): Promise<readonly Payment[]> {
    return repositoryCall(() => this.repository.list(organizationId));
  }
}

/** Records a payment confirmation and its outbox event atomically. */
export class RecordPaymentConfirmation {
  /** @param repository - Payments persistence port. */
  constructor(private readonly repository: PaymentsRepository) {}

  /**
   * @param input - Invoice, provider, amount and idempotency information.
   * @returns The confirmed payment and durable event.
   * @throws {PaymentFailure} When business validation or persistence fails.
   */
  execute(input: ConfirmPaymentInput): Promise<{ payment: Payment; event: PaymentConfirmed }> {
    return repositoryCall(() => this.repository.confirm(input));
  }
}

async function repositoryCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof PaymentFailure) throw cause;
    throw new PaymentFailure("PAYMENT_REPOSITORY_UNAVAILABLE", "No se pudo acceder a los pagos.", { cause });
  }
}
