import type { Money } from "@kontave/billing-domain";
import type { OrganizationId } from "@kontave/organizations-domain";
import type { Payment, PaymentConfirmed, PaymentProvider } from "@kontave/payments-domain";

export interface PaymentsRepository {
  list(organizationId: OrganizationId): Promise<readonly Payment[]>;
  confirm(input: {
    organizationId: OrganizationId;
    invoiceId: string;
    provider: PaymentProvider;
    providerReference: string;
    amount: Money;
    occurredAt: string;
    idempotencyKey: string;
  }): Promise<{ payment: Payment; event: PaymentConfirmed }>;
}

export interface PaymentEventOutbox {
  markProcessed(eventId: string, processedAt: string): Promise<void>;
}

export class ListPayments {
  constructor(private readonly repository: PaymentsRepository) {}
  execute(organizationId: OrganizationId) { return this.repository.list(organizationId); }
}

export class RecordPaymentConfirmation {
  constructor(private readonly repository: PaymentsRepository) {}
  execute(input: {
    organizationId: OrganizationId;
    invoiceId: string;
    provider: PaymentProvider;
    providerReference: string;
    amount: Money;
    occurredAt: string;
    idempotencyKey: string;
  }) {
    return this.repository.confirm(input);
  }
}
