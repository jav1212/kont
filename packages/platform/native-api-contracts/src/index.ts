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
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_ALREADY_FINALIZED"
  | "PAYMENT_AMOUNT_INVALID"
  | "PAYMENT_CURRENCY_MISMATCH"
  | "PAYMENT_INVOICE_NOT_PAYABLE"
  | "PAYMENT_REPOSITORY_UNAVAILABLE"
  | "PROFILE_REPOSITORY_UNAVAILABLE"
  | "PLATFORM_STATUS_REPOSITORY_UNAVAILABLE"
  | "BILLING_CREDIT_INSUFFICIENT"
  | "BILLING_INVOICE_NOT_APPLICABLE"
  | "BILLING_CURRENCY_MISMATCH"
  | "BILLING_REPOSITORY_UNAVAILABLE"
  | "MODULE_INVALID"
  | "MODULE_NOT_FOUND"
  | "MODULE_NOT_ENTITLED"
  | "MODULE_DEPENDENCY_MISSING"
  | "MODULE_DEPENDENT_ACTIVE"
  | "MODULE_ALREADY_INSTALLED"
  | "MODULE_NOT_INSTALLED"
  | "MODULE_NOT_ACTIVE"
  | "MODULE_CAPABILITY_UNAVAILABLE"
  | "COMPANY_MODULE_NOT_ACTIVE"
  | "MODULE_REPOSITORY_UNAVAILABLE"
  | "DELEGATION_INVALID"
  | "DELEGATION_NOT_FOUND"
  | "DELEGATION_NOT_ACTIVE"
  | "DELEGATION_TRANSITION_INVALID"
  | "ACCESS_PATH_NOT_FOUND"
  | "ORGANIZATION_ACCESS_REPOSITORY_UNAVAILABLE"
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

export interface NativeCurrentUserDto {
  readonly userId: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
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
  readonly logoUrl: string | null;
}

export interface NativeCompanyDto {
  readonly id: string;
  readonly organizationId: string;
  readonly legacyCompanyId: string | null;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: string | null;
  readonly country: string;
  readonly status: string;
}
export interface NativeEmployeeDto {readonly id:string;readonly companyId:string;readonly legacyEmployeeId:string|null;readonly nationalId:string;readonly fullName:string;readonly position:string;readonly hiredOn:string|null;readonly employmentType:string;readonly status:string;readonly monthlySalaryMinor:string;readonly currency:string;readonly compensationEffectiveFrom:string;readonly version:number}

export interface NativeOrganizationAccessPathDto {
  readonly kind: string;
  readonly actorUserId: string;
  readonly actingOrganizationId: string;
  readonly targetOrganizationId: string;
  readonly delegationId: string | null;
  readonly scopes: readonly string[];
}

export interface NativeAccessibleOrganizationDto {
  readonly organizationId: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly relationship: NativeOrganizationRelationship;
  readonly accessPath: NativeOrganizationAccessPathDto;
}

export type NativeOrganizationRelationship = "personal" | "member" | "delegated";

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

export type NativePortalAvailability = "operational" | "degraded" | "down" | "unknown";

export interface NativePortalStatusDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly category: "fiscal" | "laboral" | "mercantil";
  readonly logoUrl: string | null;
  readonly status: NativePortalAvailability;
  readonly responseTimeMs: number | null;
  readonly checkedAt: string | null;
}

export interface NativePlatformStatusDto {
  readonly status: NativePortalAvailability;
  readonly observedAt: string | null;
  readonly summary: {
    readonly operational: number;
    readonly degraded: number;
    readonly down: number;
    readonly unknown: number;
    readonly total: number;
  };
  readonly portals: readonly NativePortalStatusDto[];
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
export interface NativePaymentDto {
  readonly id: string; readonly organizationId: string; readonly invoiceId: string;
  readonly provider: string; readonly providerReference: string; readonly amount: NativeMoneyDto;
  readonly status: string; readonly confirmedAt: string | null; readonly createdAt: string;
}
export interface NativeBillingCreditApplicationDto {
  readonly id: string; readonly organizationId: string; readonly invoiceId: string;
  readonly entryId: string; readonly amount: NativeMoneyDto; readonly appliedAt: string;
}
