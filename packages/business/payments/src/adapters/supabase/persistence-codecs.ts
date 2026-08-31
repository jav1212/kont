import { Currency } from "@kontave/billing/domain";
import { PaymentEventType, PaymentProvider, PaymentStatus } from "../../domain";
import { z } from "zod";

/** Runtime schema for persisted organization payment rows. */
export const paymentRowSchema = z.object({
  id: z.uuid(), organization_id: z.uuid(), invoice_id: z.uuid(),
  provider: z.enum(PaymentProvider), provider_reference: z.string(),
  amount_minor: z.union([z.string(),z.number(),z.bigint()]), currency: z.enum(Currency),
  status: z.enum(PaymentStatus), confirmed_at: z.string().nullable(), created_at: z.string(),
});
/** Runtime schema for payment-confirmed outbox events. */
export const confirmedEventSchema = z.object({
  id: z.uuid(), paymentId: z.uuid(), organizationId: z.uuid(), invoiceId: z.uuid(),
  amountMinor: z.string(), currency: z.enum(Currency), isFirstPaidInvoice: z.boolean(), occurredAt: z.string(),
}).transform((value) => ({ ...value, type: PaymentEventType.Confirmed as const }));
/** Runtime schema for the atomic payment-confirmation RPC result. */
export const confirmedPaymentResultSchema = z.object({ payment: paymentRowSchema, event: confirmedEventSchema });
