import type { NativeBillingCreditApplicationDto,NativeMoneyDto,NativePaymentDto } from "@kontave/native-api-contracts";
import type { BillingCreditApplication,Money } from "@kontave/billing-domain";
import type { Payment } from "@kontave/payments-domain";
export function toPaymentDto(v:Payment):NativePaymentDto{return{id:v.id,organizationId:v.organizationId,invoiceId:v.invoiceId,provider:v.provider,providerReference:v.providerReference,amount:toMoneyDto(v.amount),status:v.status,confirmedAt:v.confirmedAt,createdAt:v.createdAt}}
export function toCreditApplicationDto(v:BillingCreditApplication):NativeBillingCreditApplicationDto{return{id:v.id,organizationId:v.organizationId,invoiceId:v.invoiceId,entryId:v.entryId,amount:toMoneyDto(v.amount),appliedAt:v.appliedAt}}
export function toMoneyDto(v:Money):NativeMoneyDto{return{minorAmount:v.minorAmount.toString(),currency:v.currency}}
