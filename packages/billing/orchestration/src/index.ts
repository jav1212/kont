import type { OrganizationId } from "@kontave/organizations-domain";
import type { PaymentEventOutbox, RecordPaymentConfirmation } from "@kontave/payments-application";
import type { Payment, PaymentProvider } from "@kontave/payments-domain";
import type { GrantReferralReward } from "@kontave/referrals-application";
import type { Money } from "@kontave/billing-domain";

export class ConfirmPayment {
  constructor(
    private readonly recordPayment: Pick<RecordPaymentConfirmation, "execute">,
    private readonly grantReferralReward: Pick<GrantReferralReward, "execute">,
    private readonly outbox: PaymentEventOutbox,
  ) {}

  async execute(input: {
    organizationId: OrganizationId;
    invoiceId: string;
    provider: PaymentProvider;
    providerReference: string;
    amount: Money;
    occurredAt: string;
    idempotencyKey: string;
  }): Promise<Payment> {
    const result = await this.recordPayment.execute(input);
    await this.grantReferralReward.execute({
      referredOrganizationId: input.organizationId,
      sourceInvoiceId: input.invoiceId,
      paidAmount: input.amount,
      isFirstPaidInvoice: result.event.isFirstPaidInvoice,
      occurredAt: input.occurredAt,
    });
    await this.outbox.markProcessed(result.event.id, input.occurredAt);
    return result.payment;
  }
}
