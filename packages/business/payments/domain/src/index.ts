import type { Money } from "@kontave/billing-domain";
import type { OrganizationId } from "@kontave/organizations/domain";

/** Persisted lifecycle states for an organization payment. */
export enum PaymentStatus {
  Pending = "pending",
  Confirmed = "confirmed",
  Failed = "failed",
  Refunded = "refunded",
}

/** Providers supported by the portable payments contract. */
export enum PaymentProvider {
  Manual = "manual",
  Stripe = "stripe",
  MercadoPago = "mercado_pago",
  Bank = "bank",
}

/** Stable event names emitted by the payments capability. */
export enum PaymentEventType {
  Confirmed = "payment.confirmed",
  Failed = "payment.failed",
  Refunded = "payment.refunded",
}

/** Payment recorded against an organization invoice. */
export interface Payment {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly invoiceId: string;
  readonly provider: PaymentProvider;
  readonly providerReference: string;
  readonly amount: Money;
  readonly status: PaymentStatus;
  readonly confirmedAt: string | null;
  readonly createdAt: string;
}

/** Outbox event emitted atomically when a payment is confirmed. */
export interface PaymentConfirmed {
  readonly id: string;
  readonly type: PaymentEventType.Confirmed;
  readonly paymentId: string;
  readonly organizationId: OrganizationId;
  readonly invoiceId: string;
  readonly amount: Money;
  readonly isFirstPaidInvoice: boolean;
  readonly occurredAt: string;
}

/** Stable expected-failure codes exposed by the payments capability. */
export type PaymentFailureCode =
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_ALREADY_FINALIZED"
  | "PAYMENT_AMOUNT_INVALID"
  | "PAYMENT_CURRENCY_MISMATCH"
  | "PAYMENT_INVOICE_NOT_PAYABLE"
  | "PAYMENT_REPOSITORY_UNAVAILABLE";

/** Expected failure raised by payment domain and boundary operations. */
export class PaymentFailure extends Error {
  /**
   * Creates a portable payment failure.
   *
   * @param code - Stable machine-readable failure code.
   * @param message - Safe diagnostic message.
   * @param options - Optional underlying cause.
   */
  constructor(readonly code: PaymentFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PaymentFailure";
  }
}
