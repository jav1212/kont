export type NativeApiErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_ACCESS_TOKEN"
  | "SESSION_NOT_FOUND"
  | "SESSION_REVOKED"
  | "PASSWORD_POLICY_VIOLATION"
  | "INVALID_REQUEST"
  | "ORGANIZATION_NOT_FOUND"
  | "ORGANIZATION_ACCESS_DENIED"
  | "ORGANIZATION_VERSION_CONFLICT"
  | "ORGANIZATION_DATA_INVALID"
  | "ORGANIZATION_LOGO_INVALID"
  | "ORGANIZATION_REPOSITORY_UNAVAILABLE"
  | "ROLE_NOT_FOUND" | "ROLE_VERSION_CONFLICT" | "ROLE_INVALID" | "ROLE_IN_USE" | "SYSTEM_ROLE_IMMUTABLE" | "CANNOT_GRANT_UNOWNED_PERMISSION" | "CANNOT_ASSIGN_OWNER" | "ROLE_OUTSIDE_ORGANIZATION" | "ACCESS_CONTROL_REPOSITORY_UNAVAILABLE"
  | "MEMBERSHIP_NOT_FOUND" | "MEMBERSHIP_VERSION_CONFLICT" | "INVITATION_NOT_FOUND" | "INVITATION_INVALID" | "INVITATION_ALREADY_PENDING" | "INVITATION_VERSION_CONFLICT"
  | "COMPANY_NOT_FOUND"
  | "COMPANY_ACCESS_DENIED"
  | "BILLING_ACCESS_DENIED"
  | "BILLING_ACCOUNT_NOT_FOUND"
  | "BILLING_PLAN_NOT_FOUND"
  | "BILLING_PLAN_CONTACT_REQUIRED"
  | "BILLING_PAYMENT_REQUEST_INVALID"
  | "BILLING_RECEIPT_INVALID"
  | "BILLING_RECEIPT_UNAVAILABLE"
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
  | "PROFILE_DATA_INVALID"
  | "PROFILE_VERSION_CONFLICT"
  | "PROFILE_AVATAR_INVALID"
  | "PROFILE_AVATAR_UNAVAILABLE"
  | "PREFERENCES_INVALID"
  | "PREFERENCES_VERSION_CONFLICT"
  | "PREFERENCES_REPOSITORY_UNAVAILABLE"
  | "PLATFORM_STATUS_REPOSITORY_UNAVAILABLE"
  | "DOCUMENT_INVALID"
  | "DOCUMENT_NOT_FOUND"
  | "DOCUMENT_VERSION_CONFLICT"
  | "DOCUMENT_FOLDER_NOT_FOUND"
  | "DOCUMENT_FOLDER_VERSION_CONFLICT"
  | "DOCUMENT_FOLDER_NOT_EMPTY"
  | "DOCUMENT_OUTSIDE_ORGANIZATION"
  | "DOCUMENT_OUTSIDE_COMPANY"
  | "DOCUMENT_STORAGE_UNAVAILABLE"
  | "DOCUMENT_REPOSITORY_UNAVAILABLE"
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
export interface NativeAuthenticatedDeviceSessionDto{readonly id:string;readonly client:"web"|"desktop"|"mobile";readonly deviceName:string|null;readonly operatingSystem:string|null;readonly createdAt:string;readonly lastSeenAt:string;readonly current:boolean}
export interface NativeChangePasswordDto{readonly newPassword:string;readonly revokeOtherSessions?:boolean}

export interface NativeCurrentUserDto {
  readonly userId: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly version: number;
}

export interface NativeUpdateCurrentUserDto { readonly displayName?: string; readonly expectedVersion: number }

export interface NativeUserPreferencesDto {
  readonly appearance: { readonly colorScheme: "light" | "dark" | "system"; readonly density: "comfortable" | "compact" };
  readonly regional: { readonly locale: string; readonly timeZone: string };
  readonly version: number;
  readonly updatedAt: string;
}

export interface NativeUpdateUserPreferencesDto {
  readonly expectedVersion: number;
  readonly appearance?: Partial<NativeUserPreferencesDto["appearance"]>;
  readonly regional?: Partial<NativeUserPreferencesDto["regional"]>;
}

export interface NativeOrganizationDto {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly role: "owner" | "admin" | "accountant" | "seller" | "cashier";
  readonly permissions: readonly string[];
  readonly logoUrl: string | null;
  readonly version: number;
}
export interface NativeUpdateOrganizationDto { readonly name?: string; readonly expectedVersion: number }
export interface NativePermissionDto { readonly code:string; readonly resource:string; readonly action:string; readonly description:string }
export interface NativeRoleDto { readonly id:string;readonly organizationId:string;readonly code:string;readonly name:string;readonly description:string;readonly kind:"system"|"custom";readonly permissions:readonly string[];readonly status:"active"|"archived";readonly version:number }
export interface NativeCreateRoleDto {readonly name:string;readonly description?:string;readonly permissions:readonly string[]}
export interface NativeUpdateRoleDto {readonly name?:string;readonly description?:string;readonly permissions?:readonly string[];readonly expectedVersion:number}
export interface NativeOrganizationMemberDto {readonly id:string;readonly kind:"membership"|"invitation";readonly organizationId:string;readonly userId:string|null;readonly email:string;readonly displayName:string|null;readonly avatarUrl:string|null;readonly roleId:string;readonly roleName:string;readonly status:"active"|"invited"|"suspended";readonly version:number;readonly joinedAt:string|null;readonly invitedAt:string|null;readonly expiresAt:string|null}
export interface NativeCreateMemberInvitationDto{readonly email:string;readonly roleId:string;readonly expiresInDays?:number}
export interface NativeResendMemberInvitationDto{readonly expectedVersion:number;readonly expiresInDays?:number}
export interface NativeUpdateMembershipDto{readonly roleId?:string;readonly status?:"active"|"suspended";readonly expectedVersion:number}
export interface NativeDocumentFolderDto{readonly id:string;readonly organizationId:string;readonly companyId:string|null;readonly parentId:string|null;readonly name:string;readonly createdBy:string;readonly version:number;readonly createdAt:string;readonly updatedAt:string}
export interface NativeDocumentDto{readonly id:string;readonly organizationId:string;readonly companyId:string|null;readonly folderId:string|null;readonly name:string;readonly contentType:string|null;readonly sizeBytes:number|null;readonly uploadedBy:string;readonly version:number;readonly createdAt:string;readonly updatedAt:string}
export interface NativeCreateDocumentFolderDto{readonly name:string;readonly companyId?:string|null;readonly parentId?:string|null}
export interface NativeRenameDocumentFolderDto{readonly name:string;readonly expectedVersion:number}
export interface NativeCreateDocumentUploadDto{readonly fileName:string}
export interface NativeRegisterDocumentDto{readonly name:string;readonly storageKey:string;readonly companyId?:string|null;readonly folderId?:string|null;readonly contentType?:string|null;readonly sizeBytes?:number|null}
export interface NativeMoveDocumentDto{readonly folderId:string|null;readonly expectedVersion:number}

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
export interface NativeBillingPlanDto {
  readonly id: string; readonly name: string; readonly maxCompanies: number | null;
  readonly maxEmployeesPerCompany: number | null; readonly monthlyPrice: NativeMoneyDto;
  readonly quarterlyPrice: NativeMoneyDto; readonly annualPrice: NativeMoneyDto;
  readonly productCode: string | null; readonly contactOnly: boolean;
}
export interface NativeManualPaymentRequestDto {
  readonly id: string; readonly planId: string; readonly billingCycle: "monthly" | "quarterly" | "annual";
  readonly amount: NativeMoneyDto; readonly discount: NativeMoneyDto;
  readonly paymentMethod: "transfer" | "cash" | "credit"; readonly hasReceipt: boolean;
  readonly status: "pending" | "approved" | "rejected"; readonly notes: string | null;
  readonly submittedAt: string; readonly reviewedAt: string | null;
}
export interface NativeSubmitManualPaymentRequestDto {
  readonly planId: string; readonly billingCycle: "monthly" | "quarterly" | "annual";
  readonly paymentMethod: "transfer" | "cash"; readonly receiptStorageKey?: string | null;
}
export interface NativeCreatePaymentReceiptUploadDto { readonly fileName: string; readonly contentType: string }
export interface NativePaymentReceiptUploadDto { readonly uploadUrl: string; readonly storageKey: string }
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
