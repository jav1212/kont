import type { NativeBillingAccountDto, NativeBillingOverviewDto, NativeEntitlementsDto, NativeInvoiceDto, NativePaymentMethodDto, NativeSubscriptionDto, NativeUsageDto } from "@kontave/native-api-contracts";
import type { BillingAccount, BillingOverview, Invoice, OrganizationEntitlements, OrganizationUsage, PaymentMethod, Subscription } from "@kontave/billing-domain";
import type { BillingPlan, ManualPaymentRequest } from "@kontave/billing-domain";
import type { NativeBillingPlanDto, NativeManualPaymentRequestDto } from "@kontave/native-api-contracts";

export const toBillingAccountDto = (value: BillingAccount): NativeBillingAccountDto => ({ ...value, organizationId: value.organizationId });
export const toSubscriptionDto = (value: Subscription): NativeSubscriptionDto => ({
  id: value.id, productCode: value.productCode, planId: value.planId, planName: value.planName, status: value.status,
  billingCycle: value.billingCycle, currentPeriodStart: value.currentPeriodStart, currentPeriodEnd: value.currentPeriodEnd,
});
export const toEntitlementsDto = (value: OrganizationEntitlements): NativeEntitlementsDto => value;
export const toUsageDto = (value: OrganizationUsage): NativeUsageDto => value;
export const toInvoiceDto = (value: Invoice): NativeInvoiceDto => ({
  id: value.id, number: value.number, status: value.status,
  subtotal: { minorAmount: value.subtotal.minorAmount.toString(), currency: value.subtotal.currency },
  tax: { minorAmount: value.tax.minorAmount.toString(), currency: value.tax.currency },
  total: { minorAmount: value.total.minorAmount.toString(), currency: value.total.currency },
  issuedAt: value.issuedAt, dueAt: value.dueAt, paidAt: value.paidAt,
});
export const toPaymentMethodDto = (value: PaymentMethod): NativePaymentMethodDto => ({
  id: value.id, kind: value.kind, provider: value.provider, displayLabel: value.displayLabel, isDefault: value.isDefault,
});
export const toBillingOverviewDto = (value: BillingOverview): NativeBillingOverviewDto => ({
  account: toBillingAccountDto(value.account), subscriptions: value.subscriptions.map(toSubscriptionDto),
  entitlements: toEntitlementsDto(value.entitlements), usage: toUsageDto(value.usage),
});
const toMoneyDto = (value: { readonly minorAmount: bigint; readonly currency: "USD" | "VES" }) => ({ minorAmount: value.minorAmount.toString(), currency: value.currency });
export const toBillingPlanDto = (value: BillingPlan): NativeBillingPlanDto => ({ ...value, monthlyPrice: toMoneyDto(value.monthlyPrice), quarterlyPrice: toMoneyDto(value.quarterlyPrice), annualPrice: toMoneyDto(value.annualPrice) });
export const toManualPaymentRequestDto = (value: ManualPaymentRequest): NativeManualPaymentRequestDto => ({ id: value.id, planId: value.planId, billingCycle: value.billingCycle, amount: toMoneyDto(value.amount), discount: toMoneyDto(value.discount), paymentMethod: value.paymentMethod, hasReceipt: value.receiptStorageKey !== null, status: value.status, notes: value.notes, submittedAt: value.submittedAt, reviewedAt: value.reviewedAt });
