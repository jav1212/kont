import type { PaymentsRepository, PaymentEventOutbox } from "@kontave/payments-application";
import type { OrganizationId } from "@kontave/organizations-domain";
import type { Payment, PaymentConfirmed } from "@kontave/payments-domain";

export class InMemoryPaymentsRepository implements PaymentsRepository {
  constructor(
    readonly payment: Payment,
    readonly event: PaymentConfirmed,
    readonly payments: Payment[] = [],
  ) {}
  async list(organizationId: OrganizationId) {
    return this.payments.filter((payment) => payment.organizationId === organizationId);
  }
  async confirm() {
    if (!this.payments.some((payment) => payment.id === this.payment.id)) this.payments.push(this.payment);
    return { payment: this.payment, event: this.event };
  }
}

export class RecordingPaymentOutbox implements PaymentEventOutbox {
  readonly processed: string[] = [];
  async markProcessed(eventId: string) { this.processed.push(eventId); }
}
