import type { OrganizationId } from "@kontave/organizations/domain";
import type { Money } from "../domain";

/** Payment facts accepted by the orchestration boundary. */
export interface PaymentConfirmationRequest<TProvider extends string> {
  readonly organizationId: OrganizationId;
  readonly invoiceId: string;
  readonly provider: TProvider;
  readonly providerReference: string;
  readonly amount: Money;
  readonly occurredAt: string;
  readonly idempotencyKey: string;
}

/** Minimal payment capability required by Billing orchestration. */
export interface PaymentConfirmation<TProvider extends string, TPayment> {
  /**
   * Records a payment and its durable event atomically.
   *
   * @param input - Provider-specific payment confirmation facts.
   * @returns The confirmed payment and downstream event facts.
   * @throws When payment validation or persistence fails.
   */
  execute(input: PaymentConfirmationRequest<TProvider>): Promise<{
    payment: TPayment;
    event: { readonly id: string; readonly isFirstPaidInvoice: boolean };
  }>;
}

/** Boundary for acknowledging a processed payment event. */
export interface PaymentEventAcknowledgement {
  /**
   * Marks a payment event as processed after downstream coordination succeeds.
   *
   * @param eventId - Durable payment event identifier.
   * @param processedAt - Processing instant.
   * @returns A promise completed after acknowledgement.
   * @throws When the outbox cannot persist the acknowledgement.
   */
  markProcessed(eventId: string, processedAt: string): Promise<void>;
}

/** Collaboration port for granting a referral reward after payment confirmation. */
export interface ReferralRewardGrant {
  /**
   * Grants or replays the reward associated with a qualifying paid invoice.
   *
   * @param input - Payment facts required by the referrals capability.
   * @returns A promise completed after the reward decision and any credit issuance.
   * @throws When the referrals boundary cannot process the reward.
   */
  execute(input: {
    referredOrganizationId: OrganizationId;
    sourceInvoiceId: string;
    paidAmount: Money;
    isFirstPaidInvoice: boolean;
    occurredAt: string;
  }): Promise<unknown>;
}

/** Coordinates an atomic payment record with referral reward and outbox acknowledgement. */
export class ConfirmPayment<TProvider extends string, TPayment> {
  /**
   * Creates the cross-capability payment confirmation coordinator.
   *
   * @param recordPayment - Payment confirmation boundary.
   * @param grantReferralReward - Referral reward boundary.
   * @param outbox - Payment-event acknowledgement boundary.
   */
  constructor(
    private readonly recordPayment: PaymentConfirmation<TProvider, TPayment>,
    private readonly grantReferralReward: ReferralRewardGrant,
    private readonly outbox: PaymentEventAcknowledgement,
  ) {}

  /**
   * Confirms a payment, grants any referral reward, and marks its event processed in order.
   *
   * @param input - Organization, invoice, provider, amount and idempotency facts.
   * @returns The confirmed payment.
   * @throws When payment, referrals, or outbox processing fails.
   */
  async execute(input: PaymentConfirmationRequest<TProvider>): Promise<TPayment> {
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
