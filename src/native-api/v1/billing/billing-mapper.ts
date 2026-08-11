import type { NativeBillingAccountDto, NativeBillingOverviewDto, NativeEntitlementsDto, NativeInvoiceDto, NativePaymentMethodDto, NativeSubscriptionDto, NativeUsageDto } from "@kontave/native-api-contracts";
import type { BillingAccount, BillingOverview, Invoice, OrganizationEntitlements, OrganizationUsage, PaymentMethod, Subscription } from "@kontave/billing-domain";

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
