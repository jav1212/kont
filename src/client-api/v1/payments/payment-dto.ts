import type {
  BillingCreditApplicationDto,
  MoneyDto,
  PaymentDto,
} from "@kontave/client-contracts";
import type { BillingCreditApplication, Money } from "@kontave/billing/domain";
import type { Payment } from "@kontave/payments/domain";
export function toPaymentDto(v: Payment): PaymentDto {
  return {
    id: v.id,
    organizationId: v.organizationId,
    invoiceId: v.invoiceId,
    provider: v.provider,
    providerReference: v.providerReference,
    amount: toMoneyDto(v.amount),
    status: v.status,
    confirmedAt: v.confirmedAt,
    createdAt: v.createdAt,
  };
}
export function toCreditApplicationDto(
  v: BillingCreditApplication,
): BillingCreditApplicationDto {
  return {
    id: v.id,
    organizationId: v.organizationId,
    invoiceId: v.invoiceId,
    entryId: v.entryId,
    amount: toMoneyDto(v.amount),
    appliedAt: v.appliedAt,
  };
}
export function toMoneyDto(v: Money): MoneyDto {
  return { minorAmount: v.minorAmount.toString(), currency: v.currency };
}
