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
  | "OPERATION_CONTEXT_INVALID"
  | "OPERATION_CONTEXT_ACCESS_DENIED"
  | "OPERATION_CONTEXT_VERSION_CONFLICT"
  | "OPERATION_CONTEXT_RATE_UNAVAILABLE"
  | "OPERATION_CONTEXT_REPOSITORY_UNAVAILABLE"
  | "INVENTORY_DASHBOARD_INVALID"
  | "INVENTORY_DASHBOARD_ACCESS_DENIED"
  | "INVENTORY_DASHBOARD_UNAVAILABLE"
  | "INVENTORY_PROFILE_VERSION_CONFLICT"
  | "INVENTORY_PROFILE_INVALID"
  | "INVENTORY_REPOSITORY_UNAVAILABLE"
  | "INVENTORY_OPERATION_INVALID"
  | "INVENTORY_OPERATION_NOT_FOUND"
  | "INVENTORY_OPERATION_VERSION_CONFLICT"
  | "INVENTORY_OPERATION_TRANSITION_INVALID"
  | "INVENTORY_OPERATION_ACCESS_DENIED"
  | "INVENTORY_NEGATIVE_STOCK"
  | "INVENTORY_PERIOD_CLOSED"
  | "PRODUCT_IDENTIFIER_INVALID"
  | "PRODUCT_INVALID"
  | "PRODUCT_CATEGORY_INVALID"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_CATEGORY_NOT_FOUND"
  | "PRODUCT_VERSION_CONFLICT"
  | "PRODUCT_CATEGORY_VERSION_CONFLICT"
  | "PRODUCT_DUPLICATE_SKU"
  | "PRODUCT_DUPLICATE_BARCODE"
  | "PRODUCT_DUPLICATE_CATEGORY"
  | "PRODUCT_OUTSIDE_COMPANY"
  | "PRODUCT_ACCESS_DENIED"
  | "PRODUCT_TRANSITION_INVALID"
  | "PRODUCT_LOCATION_TRACKING_UNAVAILABLE"
  | "PRODUCT_REPOSITORY_UNAVAILABLE"
  | "PRICING_INVALID" | "PRICING_NOT_FOUND" | "PRICING_PRODUCT_NOT_FOUND" | "PRICING_VERSION_CONFLICT" | "PRICING_ACCESS_DENIED" | "PRICING_REPOSITORY_UNAVAILABLE"
  | "TAXATION_IDENTIFIER_INVALID" | "TAXATION_DATE_INVALID" | "TAXATION_PROFILE_INVALID" | "TAXATION_ASSIGNMENT_OVERLAP" | "TAXATION_CLASSIFICATION_MISSING" | "TAXATION_RULE_INVALID" | "TAXATION_RULE_MISSING" | "TAXATION_RULE_AMBIGUOUS" | "TAXATION_DECISION_INVALID" | "TAXATION_CURRENCY_MISMATCH" | "TAXATION_PROFILE_NOT_FOUND" | "TAXATION_VERSION_CONFLICT" | "TAXATION_ACCESS_DENIED" | "TAXATION_REPOSITORY_UNAVAILABLE"
  | "PRODUCT_INSIGHTS_INVALID" | "PRODUCT_INSIGHTS_NOT_FOUND" | "PRODUCT_INSIGHTS_ACCESS_DENIED" | "PRODUCT_INSIGHTS_UNAVAILABLE"
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

export interface NativeExchangeRateSnapshotDto {
  readonly baseCurrency: string;
  readonly quoteCurrency: string;
  readonly value: string;
  readonly effectiveDate: string;
  readonly capturedAt: string;
  readonly source:
    | { readonly kind: "official"; readonly authority: string; readonly reference: string | null }
    | { readonly kind: "manual"; readonly reason: string };
}

export interface NativeOperationalDefaultsDto {
  readonly effectiveDate: string;
  readonly presentationCurrency: string;
  readonly exchangeRate:
    | { readonly status: "resolved"; readonly value: NativeExchangeRateSnapshotDto }
    | { readonly status: "unavailable"; readonly effectiveDate: string };
  readonly version: number;
  readonly updatedAt: string;
}

export interface NativeUpdateOperationalDefaultsDto {
  readonly expectedVersion: number;
  readonly effectiveDate?: string;
  readonly presentationCurrency?: string;
  readonly manualExchangeRate?: { readonly baseCurrency: string; readonly value: string; readonly reason: string };
}

export interface NativeRefreshOperationalExchangeRateDto { readonly expectedVersion: number }

export interface NativeExchangeRateSetDto {
  readonly requestedDate: string;
  readonly effectiveDate: string;
  readonly resolution: "exact_date" | "previous_available_date";
  readonly observedAt: string;
  readonly rates: readonly NativeExchangeRateSnapshotDto[];
}

export interface NativeInventoryAmountDto { readonly amount: string; readonly currency: "VES" }
export interface NativeInventoryUnitFlowDto { readonly unit: string; readonly inbound: string; readonly outbound: string }
export interface NativeInventoryDashboardSummaryDto {
  readonly inboundValue: NativeInventoryAmountDto;
  readonly outboundValue: NativeInventoryAmountDto;
  readonly movementCount: number;
  readonly inventoryValue: NativeInventoryAmountDto;
  readonly quantities: readonly NativeInventoryUnitFlowDto[];
  readonly valuationDate: string;
}
export interface NativeInventoryDashboardChartPointDto {
  readonly date: string;
  readonly inboundValue: NativeInventoryAmountDto;
  readonly outboundValue: NativeInventoryAmountDto;
  readonly movementCount: number;
  readonly quantities: readonly NativeInventoryUnitFlowDto[];
}
export interface NativeRecentInventoryDocumentDto {
  readonly id: string;
  readonly recordType: "invoice" | "delivery_note" | "debit_note" | "credit_note" | "other";
  readonly number: string;
  readonly counterparty: string | null;
  readonly date: string;
  readonly status: string;
  readonly total: NativeInventoryAmountDto;
  readonly transactionCurrency: string;
  readonly sourceTotal: string | null;
}
export interface NativeRecentInventoryMovementDto{
  readonly id:string;readonly productId:string;readonly productName:string;readonly productSku:string;readonly effectiveDate:string;
  readonly movementType:string;readonly direction:"inbound"|"outbound";
  readonly quantity:{readonly value:string;readonly unit:NativeUnitOfMeasure};
  readonly totalCost:NativeInventoryAmountDto;readonly reference:string|null;
}
export interface NativeInventoryDashboardDto {
  readonly period: { readonly from: string; readonly to: string; readonly granularity: "day" };
  readonly summary: NativeInventoryDashboardSummaryDto;
  readonly charts: readonly NativeInventoryDashboardChartPointDto[];
  readonly recentSales: readonly NativeRecentInventoryDocumentDto[];
  readonly recentPurchases: readonly NativeRecentInventoryDocumentDto[];
  readonly recentInboundMovements:readonly NativeRecentInventoryMovementDto[];
  readonly recentOutboundMovements:readonly NativeRecentInventoryMovementDto[];
  readonly generatedAt: string;
}

export type NativeInventoryOperationReason="opening_balance"|"purchase_receipt"|"sales_issue"|"customer_return"|"supplier_return"|"transfer"|"stock_count_adjustment"|"self_consumption"|"production_consumption"|"production_output"|"reversal";
export type NativeInventoryOperationStatus="draft"|"posted"|"reversed";
export type NativeInventoryOperationSourceKind="purchasing"|"sales"|"inventory"|"production"|"migration";
export interface NativeInventoryFlowItemDto{readonly id:string;readonly operationId:string;readonly effectiveDate:string;readonly direction:"inbound"|"outbound";readonly reason:NativeInventoryOperationReason;readonly status:NativeInventoryOperationStatus;readonly product:{readonly id:string;readonly sku:string;readonly name:string};readonly quantity:{readonly value:string;readonly unit:NativeUnitOfMeasure};readonly unitCost:NativeInventoryAmountDto|null;readonly totalCost:NativeInventoryAmountDto|null;readonly source:{readonly kind:NativeInventoryOperationSourceKind;readonly documentId:string};readonly reference:string|null;readonly notes:string|null;readonly postedAt:string|null}
export interface NativeInventoryFlowPageDto{readonly items:readonly NativeInventoryFlowItemDto[];readonly nextCursor:string|null;readonly total:number;readonly summary:{readonly movementCount:number;readonly totalValue:NativeInventoryAmountDto;readonly quantities:readonly{readonly unit:NativeUnitOfMeasure;readonly value:string}[]}}
export interface NativeInventoryOperationDetailDto{readonly id:string;readonly companyId:string;readonly reason:NativeInventoryOperationReason;readonly effectiveDate:string;readonly status:NativeInventoryOperationStatus;readonly version:number;readonly source:{readonly kind:NativeInventoryOperationSourceKind;readonly documentId:string};readonly reference:string|null;readonly notes:string|null;readonly postedAt:string|null;readonly reversalOf:string|null;readonly reversedBy:string|null;readonly lines:readonly{readonly id:string;readonly productId:string;readonly productName:string;readonly productSku:string;readonly direction:"inbound"|"outbound";readonly quantity:{readonly value:string;readonly unit:NativeUnitOfMeasure};readonly unitCost:NativeInventoryAmountDto|null;readonly movementId:string|null}[];readonly capabilities:{readonly canPost:boolean;readonly canReverse:boolean;readonly canEditMetadata:boolean}}
export interface NativeCreateInventoryOperationDto{readonly reason:"opening_balance"|"stock_count_adjustment"|"self_consumption";readonly effectiveDate:string;readonly reference?:string|null;readonly notes?:string|null;readonly lines:readonly{readonly productId:string;readonly direction:"inbound"|"outbound";readonly quantity:string;readonly unit:NativeUnitOfMeasure;readonly unitCost?:string|null}[]}
export interface NativeInventoryOperationVersionDto{readonly expectedVersion:number}
export interface NativeUpdateInventoryOperationDto extends NativeInventoryOperationVersionDto{readonly effectiveDate?:string;readonly reference?:string|null;readonly notes?:string|null}
export interface NativeReverseInventoryOperationDto extends NativeInventoryOperationVersionDto{readonly effectiveDate:string;readonly reason:string}

export type NativeUnitOfMeasure="each"|"kilogram"|"gram"|"meter"|"square_meter"|"cubic_meter"|"liter"|"gallon"|"box"|"roll"|"package";
export interface NativeProductCategoryDto{readonly id:string;readonly name:string;readonly description:string|null;readonly status:"active"|"inactive";readonly version:number}
export interface NativeProductCategoryOverviewItemDto extends NativeProductCategoryDto{readonly productCount:number;readonly createdAt:string|null;readonly updatedAt:string|null}
export interface NativeProductCategoryOverviewDto{readonly items:readonly NativeProductCategoryOverviewItemDto[];readonly nextCursor:string|null;readonly total:number;readonly summary:{readonly active:number;readonly inactive:number;readonly inUse:number;readonly unused:number;readonly unassignedProducts:number}}
export interface NativeProductInventorySummaryDto{
  readonly onHand:{readonly quantity:string;readonly unit:NativeUnitOfMeasure};
  readonly replenishment:{readonly minimumQuantity:string|null;readonly state:"available"|"low"|"out";readonly version:number;readonly updatedAt:string};
  readonly valuation:{readonly unitCost:string;readonly totalValue:string;readonly currency:"VES"};
}
export interface NativeProductDto{
  readonly id:string;readonly sku:string;readonly barcodes:readonly string[];readonly name:string;readonly description:string|null;
  readonly category:NativeProductCategoryDto|null;readonly baseUnit:NativeUnitOfMeasure;readonly status:"active"|"inactive";
  readonly inventory:NativeProductInventorySummaryDto|null;readonly updatedAt:string;readonly version:number;
}
export interface NativeProductListDto{
  readonly items:readonly NativeProductDto[];readonly nextCursor:string|null;readonly total:number;
  readonly summary:{readonly active:number;readonly inactive:number;readonly lowStock:number;readonly outOfStock:number;readonly inventoryValue:{readonly amount:string;readonly currency:"VES"}};
}
export type NativeProductSalePricingPolicyDto={readonly mode:"fixed";readonly amount:string;readonly currency:string}|{readonly mode:"markup";readonly percentage:string;readonly currency:string};
export interface NativeProductSalePricingDto{readonly policy:NativeProductSalePricingPolicyDto|null;readonly version:number;readonly updatedAt:string}
export interface NativeUpdateProductSalePricingDto{readonly policy:NativeProductSalePricingPolicyDto|null;readonly expectedVersion:number}
export interface NativeProductTaxationDto{readonly profileId:string;readonly taxCode:string;readonly treatment:"taxed"|"exempt"|"exonerated"|"not_subject";readonly effectiveFrom:string;readonly effectiveTo:string|null;readonly resolvedRate:string;readonly legalBasis:string;readonly ruleVersion:string;readonly version:number}
export interface NativeUpdateProductTaxationDto{readonly treatment:"taxed"|"exempt"|"exonerated"|"not_subject";readonly effectiveFrom:string;readonly legalBasis:string;readonly expectedVersion:number}
export interface NativeProductUnitEconomicsAggregateDto{readonly weightedAverageUnitAmount:{readonly amount:string;readonly currency:"VES"};readonly quantity:{readonly value:string;readonly unit:NativeUnitOfMeasure};readonly observations:number}
export interface NativeProductUnitEconomicsDto{readonly period:{readonly from:string;readonly to:string;readonly granularity:"day"|"week"|"month"};readonly latestAcquisition:{readonly effectiveDate:string;readonly sourceUnitAmount:{readonly amount:string;readonly currency:string};readonly unitAmount:{readonly amount:string;readonly currency:"VES"};readonly exchangeRate:string|null;readonly quantity:{readonly value:string;readonly unit:NativeUnitOfMeasure};readonly reference:string|null;readonly documentId:string}|null;readonly points:readonly{readonly bucketStart:string;readonly acquisition:NativeProductUnitEconomicsAggregateDto|null;readonly realizedSale:NativeProductUnitEconomicsAggregateDto|null}[];readonly coverage:{readonly confirmedAcquisitions:number;readonly confirmedSales:number;readonly legacyRecordedOutboundPrices:number};readonly generatedAt:string}
export interface NativeProductDetailDto extends NativeProductDto{readonly salePricing:NativeProductSalePricingDto|null;readonly taxation:NativeProductTaxationDto|null;readonly productType:"merchandise";readonly valuationMethod:"weighted_average";readonly vat:{readonly code:"general"|"exempt";readonly rate:string}|null;readonly capabilities:{readonly inventoryEnabled:boolean;readonly locationTracking:boolean;readonly lotTracking:boolean;readonly salePricing:boolean;readonly vatConfiguration:boolean;readonly valuationMethodChange:boolean}}
export interface NativeCreateProductDto{readonly sku:string;readonly barcodes?:readonly string[];readonly name:string;readonly description?:string|null;readonly categoryId?:string|null;readonly baseUnit:NativeUnitOfMeasure}
export interface NativeUpdateProductDto{readonly sku?:string;readonly barcodes?:readonly string[];readonly name?:string;readonly description?:string|null;readonly categoryId?:string|null;readonly baseUnit?:NativeUnitOfMeasure;readonly expectedVersion:number}
export interface NativeProductVersionDto{readonly expectedVersion:number}
export interface NativeUpdateProductInventoryProfileDto{readonly minimumQuantity:string|null;readonly expectedVersion:number}
export interface NativeProductReplenishmentPolicyDto{readonly productId:string;readonly unit:NativeUnitOfMeasure;readonly minimumQuantity:string|null;readonly version:number;readonly updatedAt:string}
export interface NativeCreateProductCategoryDto{readonly name:string;readonly description?:string|null}
export interface NativeUpdateProductCategoryDto{readonly name?:string;readonly description?:string|null;readonly expectedVersion:number}
export interface NativeProductMovementDto{readonly id:string;readonly effectiveDate:string;readonly type:string;readonly quantity:{readonly value:string;readonly unit:NativeUnitOfMeasure};readonly unitCost:{readonly amount:string;readonly currency:"VES"};readonly totalCost:{readonly amount:string;readonly currency:"VES"};readonly balanceQuantity:string;readonly reference:string|null;readonly notes:string|null;readonly createdAt:string}
export interface NativeProductMovementPageDto{readonly items:readonly NativeProductMovementDto[];readonly nextCursor:string|null}

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
