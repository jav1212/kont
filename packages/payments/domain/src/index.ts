import type { Money } from "@kontave/billing-domain";
import type { OrganizationId } from "@kontave/organizations-domain";

export enum PaymentStatus {
  Pending = "pending",
  Confirmed = "confirmed",
  Failed = "failed",
  Refunded = "refunded",
}

export enum PaymentProvider {
  Manual = "manual",
  Stripe = "stripe",
  MercadoPago = "mercado_pago",
  Bank = "bank",
}

export enum PaymentEventType {
  Confirmed = "payment.confirmed",
  Failed = "payment.failed",
  Refunded = "payment.refunded",
}

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

export type PaymentFailureCode =
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_ALREADY_FINALIZED"
  | "PAYMENT_AMOUNT_INVALID"
  | "PAYMENT_CURRENCY_MISMATCH"
  | "PAYMENT_INVOICE_NOT_PAYABLE"
  | "PAYMENT_REPOSITORY_UNAVAILABLE";

export class PaymentFailure extends Error {
  constructor(readonly code: PaymentFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PaymentFailure";
  }
}
