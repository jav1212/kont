import type { OrganizationId } from "@kontave/organizations-domain";

export enum Currency { Usd = "USD", Ves = "VES" }
export enum BillingCycle { Monthly = "monthly", Quarterly = "quarterly", Annual = "annual" }
export enum SubscriptionStatus { Trial = "trial", Active = "active", Suspended = "suspended", Cancelled = "cancelled" }
export enum InvoiceStatus { Draft = "draft", Open = "open", Paid = "paid", Void = "void", Uncollectible = "uncollectible" }
export enum PaymentMethodKind { Card = "card", BankTransfer = "bank_transfer", Cash = "cash", Other = "other" }
export enum ManualPaymentMethod { Transfer = "transfer", Cash = "cash", Credit = "credit" }
export enum ManualPaymentStatus { Pending = "pending", Approved = "approved", Rejected = "rejected" }

export interface Money { readonly minorAmount: bigint; readonly currency: Currency }
export interface BillingAccount {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly legalName: string;
  readonly taxId: string | null;
  readonly billingEmail: string | null;
  readonly countryCode: string;
  readonly currency: Currency;
}
export interface Subscription {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly productCode: string;
  readonly planId: string | null;
  readonly planName: string | null;
  readonly status: SubscriptionStatus;
  readonly billingCycle: BillingCycle | null;
  readonly currentPeriodStart: string | null;
  readonly currentPeriodEnd: string | null;
}
export interface PaymentMethod {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly kind: PaymentMethodKind;
  readonly provider: string;
  readonly displayLabel: string;
  readonly isDefault: boolean;
}
export interface Invoice {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly number: string;
  readonly status: InvoiceStatus;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
  readonly issuedAt: string | null;
  readonly dueAt: string | null;
  readonly paidAt: string | null;
}
export interface BillingPlan {
  readonly id: string;
  readonly name: string;
  readonly maxCompanies: number | null;
  readonly maxEmployeesPerCompany: number | null;
  readonly monthlyPrice: Money;
  readonly quarterlyPrice: Money;
  readonly annualPrice: Money;
  readonly productCode: string | null;
  readonly contactOnly: boolean;
}
export interface ManualPaymentRequest {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly planId: string;
  readonly billingCycle: BillingCycle;
  readonly amount: Money;
  readonly discount: Money;
  readonly paymentMethod: ManualPaymentMethod;
  readonly receiptStorageKey: string | null;
  readonly status: ManualPaymentStatus;
  readonly notes: string | null;
  readonly submittedAt: string;
  readonly reviewedAt: string | null;
}
export interface PaymentReceiptUpload {
  readonly uploadUrl: string;
  readonly storageKey: string;
}
export interface Limit { readonly used: number; readonly maximum: number | null; readonly remaining: number | null }
export interface OrganizationEntitlements {
  readonly maxCompanies: number | null;
  readonly maxMembers: number | null;
  readonly maxDevices: number | null;
  readonly enabledModules: readonly string[];
}
export interface OrganizationUsage {
  readonly companies: Limit;
  readonly members: Limit;
  readonly devices: Limit;
}
export interface BillingOverview {
  readonly account: BillingAccount;
  readonly subscriptions: readonly Subscription[];
  readonly entitlements: OrganizationEntitlements;
  readonly usage: OrganizationUsage;
}
export enum BillingCreditEntryType {
  ReferralGrant = "referral_grant",
  PromotionalGrant = "promotional_grant",
  ManualAdjustment = "manual_adjustment",
  InvoiceApplication = "invoice_application",
  GrantReversal = "grant_reversal",
  ApplicationReversal = "application_reversal",
  Expiration = "expiration",
}
export interface BillingCreditEntry {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly type: BillingCreditEntryType;
  readonly amount: Money;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
}
export interface BillingCreditBalance {
  readonly organizationId: OrganizationId;
  readonly balance: Money;
}
export interface BillingCreditApplication {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly invoiceId: string;
  readonly entryId: string;
  readonly amount: Money;
  readonly appliedAt: string;
}

export type BillingFailureCode = "BILLING_ACCESS_DENIED" | "BILLING_ACCOUNT_NOT_FOUND" | "BILLING_REPOSITORY_UNAVAILABLE" | "BILLING_CREDIT_INSUFFICIENT" | "BILLING_INVOICE_NOT_APPLICABLE" | "BILLING_CURRENCY_MISMATCH" | "BILLING_PLAN_NOT_FOUND" | "BILLING_PLAN_CONTACT_REQUIRED" | "BILLING_PAYMENT_REQUEST_INVALID" | "BILLING_RECEIPT_INVALID" | "BILLING_RECEIPT_UNAVAILABLE";
export class BillingFailure extends Error {
  constructor(readonly code: BillingFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BillingFailure";
  }
}

export function money(minorAmount: bigint, currency: Currency): Money {
  if (minorAmount < BigInt(0)) throw new TypeError("Money cannot be negative.");
  return { minorAmount, currency };
}

export function limit(used: number, maximum: number | null): Limit {
  if (!Number.isInteger(used) || used < 0 || (maximum !== null && (!Number.isInteger(maximum) || maximum < 0))) {
    throw new TypeError("Usage limits must be non-negative integers.");
  }
  return { used, maximum, remaining: maximum === null ? null : Math.max(0, maximum - used) };
}
