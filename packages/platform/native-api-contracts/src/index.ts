export type NativeApiErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_ACCESS_TOKEN"
  | "INVALID_REQUEST"
  | "ORGANIZATION_NOT_FOUND"
  | "ORGANIZATION_ACCESS_DENIED"
  | "COMPANY_NOT_FOUND"
  | "COMPANY_ACCESS_DENIED"
  | "BILLING_ACCESS_DENIED"
  | "BILLING_ACCOUNT_NOT_FOUND"
  | "REFERRAL_ACCESS_DENIED"
  | "REFERRAL_NOT_FOUND"
  | "SELF_REFERRAL"
  | "ALREADY_ATTRIBUTED"
  | "INVALID_REWARD"
  | "REPOSITORY_UNAVAILABLE"
  | "METHOD_NOT_ALLOWED"
  | "INTERNAL_ERROR";

export interface NativeApiMeta {
  readonly requestId: string;
}

export interface NativeApiSuccess<T> {
  readonly data: T;
  readonly meta: NativeApiMeta;
}

export interface NativeApiError {
  readonly error: {
    readonly code: NativeApiErrorCode;
    readonly message: string;
    readonly requestId: string;
  };
}

export interface NativeAuthenticatedUserDto {
  readonly id: string;
  readonly email: string | null;
}

export interface NativeSessionDto {
  readonly user: NativeAuthenticatedUserDto;
}

export interface NativeOrganizationDto {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly role: "owner" | "admin" | "accountant" | "seller" | "cashier";
  readonly permissions: readonly string[];
}

export interface NativeOrganizationCompanyDto {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly rif: string | null;
}

export interface NativeMoneyDto { readonly minorAmount: string; readonly currency: "USD" | "VES" }
export interface NativeBillingAccountDto {
  readonly id: string; readonly organizationId: string; readonly legalName: string;
  readonly taxId: string | null; readonly billingEmail: string | null;
  readonly countryCode: string; readonly currency: "USD" | "VES";
}
export interface NativeSubscriptionDto {
  readonly id: string; readonly productCode: string; readonly planId: string | null; readonly planName: string | null;
  readonly status: string; readonly billingCycle: string | null; readonly currentPeriodStart: string | null; readonly currentPeriodEnd: string | null;
}
export interface NativeEntitlementsDto {
  readonly maxCompanies: number | null; readonly maxMembers: number | null; readonly maxDevices: number | null; readonly enabledModules: readonly string[];
}
export interface NativeLimitDto { readonly used: number; readonly maximum: number | null; readonly remaining: number | null }
export interface NativeUsageDto { readonly companies: NativeLimitDto; readonly members: NativeLimitDto; readonly devices: NativeLimitDto }
export interface NativeInvoiceDto {
  readonly id: string; readonly number: string; readonly status: string; readonly subtotal: NativeMoneyDto;
  readonly tax: NativeMoneyDto; readonly total: NativeMoneyDto; readonly issuedAt: string | null; readonly dueAt: string | null; readonly paidAt: string | null;
}
export interface NativePaymentMethodDto {
  readonly id: string; readonly kind: string; readonly provider: string; readonly displayLabel: string; readonly isDefault: boolean;
}
export interface NativeBillingOverviewDto {
  readonly account: NativeBillingAccountDto; readonly subscriptions: readonly NativeSubscriptionDto[];
  readonly entitlements: NativeEntitlementsDto; readonly usage: NativeUsageDto;
}

export interface NativeReferralAttributionDto {
  readonly id: string;
  readonly referrerOrganizationId: string;
  readonly referredOrganizationId: string;
  readonly code: string;
  readonly status: string;
  readonly attributedAt: string;
}

export interface NativeReferralRewardDto {
  readonly id: string;
  readonly beneficiaryOrganizationId: string;
  readonly referredOrganizationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly rewardType: string;
  readonly configuredValue: number;
  readonly calculatedCredit: NativeMoneyDto;
  readonly sourceInvoiceId: string;
  readonly status: string;
}

export interface NativeReferralOverviewDto {
  readonly code: string;
  readonly referredBy: string | null;
  readonly attributions: number;
  readonly rewards: readonly NativeReferralRewardDto[];
  readonly balance: NativeMoneyDto;
}
