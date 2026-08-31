import type { OrganizationId } from "@kontave/organizations/domain";
import type { PaymentEventOutbox, PaymentsRepository } from "../application";
import type { Payment, PaymentConfirmed } from "../domain";

/** Deterministic payment repository for application and orchestration tests. */
export class InMemoryPaymentsRepository implements PaymentsRepository {
  /**
   * @param payment - Payment returned by confirmation.
   * @param event - Event returned atomically with confirmation.
   * @param payments - Initial mutable payment collection.
   */
  constructor(
    readonly payment: Payment,
    readonly event: PaymentConfirmed,
    readonly payments: Payment[] = [],
  ) {}

  /** {@inheritDoc PaymentsRepository.list} */
  async list(organizationId: OrganizationId): Promise<readonly Payment[]> {
    return this.payments.filter((payment) => payment.organizationId === organizationId);
  }

  /** {@inheritDoc PaymentsRepository.confirm} */
  async confirm(): Promise<{ payment: Payment; event: PaymentConfirmed }> {
    if (!this.payments.some((payment) => payment.id === this.payment.id)) {
      this.payments.push(this.payment);
    }
    return { payment: this.payment, event: this.event };
  }
}

/** Outbox test double that records processed event identifiers. */
export class RecordingPaymentOutbox implements PaymentEventOutbox {
  readonly processed: string[] = [];

  /** {@inheritDoc PaymentEventOutbox.markProcessed} */
  async markProcessed(eventId: string, _processedAt: string): Promise<void> {
    this.processed.push(eventId);
  }
}
