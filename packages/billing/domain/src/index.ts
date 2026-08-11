import type { OrganizationId } from "@kontave/organizations-domain";

export type Currency = "USD" | "VES";
export type BillingCycle = "monthly" | "quarterly" | "annual";
export type SubscriptionStatus = "trial" | "active" | "suspended" | "cancelled";
export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";
export type PaymentMethodKind = "card" | "bank_transfer" | "cash" | "other";

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

export type BillingFailureCode = "BILLING_ACCESS_DENIED" | "BILLING_ACCOUNT_NOT_FOUND" | "BILLING_REPOSITORY_UNAVAILABLE";
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
