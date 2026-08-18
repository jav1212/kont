export type ApiErrorCode =
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
  | "ROLE_NOT_FOUND"
  | "ROLE_VERSION_CONFLICT"
  | "ROLE_INVALID"
  | "ROLE_IN_USE"
  | "SYSTEM_ROLE_IMMUTABLE"
  | "CANNOT_GRANT_UNOWNED_PERMISSION"
  | "CANNOT_ASSIGN_OWNER"
  | "ROLE_OUTSIDE_ORGANIZATION"
  | "ACCESS_CONTROL_REPOSITORY_UNAVAILABLE"
  | "MEMBERSHIP_NOT_FOUND"
  | "MEMBERSHIP_VERSION_CONFLICT"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_INVALID"
  | "INVITATION_ALREADY_PENDING"
  | "INVITATION_VERSION_CONFLICT"
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
  | "PURCHASING_DASHBOARD_INVALID"
  | "PURCHASING_DASHBOARD_ACCESS_DENIED"
  | "PURCHASING_DASHBOARD_UNAVAILABLE"
  | "SALES_DASHBOARD_INVALID"
  | "SALES_DASHBOARD_ACCESS_DENIED"
  | "SALES_DASHBOARD_UNAVAILABLE"
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
  | "PRICING_INVALID"
  | "PRICING_NOT_FOUND"
  | "PRICING_PRODUCT_NOT_FOUND"
  | "PRICING_VERSION_CONFLICT"
  | "PRICING_ACCESS_DENIED"
  | "PRICING_REPOSITORY_UNAVAILABLE"
  | "TAXATION_IDENTIFIER_INVALID"
  | "TAXATION_DATE_INVALID"
  | "TAXATION_PROFILE_INVALID"
  | "TAXATION_ASSIGNMENT_OVERLAP"
  | "TAXATION_CLASSIFICATION_MISSING"
  | "TAXATION_RULE_INVALID"
  | "TAXATION_RULE_MISSING"
  | "TAXATION_RULE_AMBIGUOUS"
  | "TAXATION_DECISION_INVALID"
  | "TAXATION_CURRENCY_MISMATCH"
  | "TAXATION_PROFILE_NOT_FOUND"
  | "TAXATION_VERSION_CONFLICT"
  | "TAXATION_ACCESS_DENIED"
  | "TAXATION_REPOSITORY_UNAVAILABLE"
  | "PRODUCT_INSIGHTS_INVALID"
  | "PRODUCT_INSIGHTS_NOT_FOUND"
  | "PRODUCT_INSIGHTS_ACCESS_DENIED"
  | "PRODUCT_INSIGHTS_UNAVAILABLE"
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

export interface ApiMeta {
  readonly requestId: string;
}

export interface ApiSuccess<T> {
  readonly data: T;
  readonly meta: ApiMeta;
}

export interface ApiError {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly requestId: string;
  };
}

export interface AuthenticatedUserDto {
  readonly id: string;
  readonly email: string | null;
}

export interface SessionDto {
  readonly user: AuthenticatedUserDto;
}
export interface AuthenticatedDeviceSessionDto {
  readonly id: string;
  readonly client: "web" | "desktop" | "mobile";
  readonly deviceName: string | null;
  readonly operatingSystem: string | null;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly current: boolean;
}
export interface ChangePasswordDto {
  readonly newPassword: string;
  readonly revokeOtherSessions?: boolean;
}

export interface CurrentUserDto {
  readonly userId: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly version: number;
}

export interface UpdateCurrentUserDto {
  readonly displayName?: string;
  readonly expectedVersion: number;
}

export interface UserPreferencesDto {
  readonly appearance: {
    readonly colorScheme: "light" | "dark" | "system";
    readonly density: "comfortable" | "compact";
  };
  readonly regional: { readonly locale: string; readonly timeZone: string };
  readonly version: number;
  readonly updatedAt: string;
}

export interface UpdateUserPreferencesDto {
  readonly expectedVersion: number;
  readonly appearance?: Partial<UserPreferencesDto["appearance"]>;
  readonly regional?: Partial<UserPreferencesDto["regional"]>;
}

export interface ExchangeRateSnapshotDto {
  readonly baseCurrency: string;
  readonly quoteCurrency: string;
  readonly value: string;
  readonly effectiveDate: string;
  readonly capturedAt: string;
  readonly source:
    | {
        readonly kind: "official";
        readonly authority: string;
        readonly reference: string | null;
      }
    | { readonly kind: "manual"; readonly reason: string };
}

export interface OperationalDefaultsDto {
  readonly effectiveDate: string;
  readonly presentationCurrency: string;
  readonly exchangeRate:
    | { readonly status: "resolved"; readonly value: ExchangeRateSnapshotDto }
    | { readonly status: "unavailable"; readonly effectiveDate: string };
  readonly version: number;
  readonly updatedAt: string;
}

export interface UpdateOperationalDefaultsDto {
  readonly expectedVersion: number;
  readonly effectiveDate?: string;
  readonly presentationCurrency?: string;
  readonly manualExchangeRate?: {
    readonly baseCurrency: string;
    readonly value: string;
    readonly reason: string;
  };
}

export interface RefreshOperationalExchangeRateDto {
  readonly expectedVersion: number;
}

export interface ExchangeRateSetDto {
  readonly requestedDate: string;
  readonly effectiveDate: string;
  readonly resolution: "exact_date" | "previous_available_date";
  readonly observedAt: string;
  readonly rates: readonly ExchangeRateSnapshotDto[];
}

export interface InventoryAmountDto {
  readonly amount: string;
  readonly currency: "VES";
}
export interface InventoryUnitFlowDto {
  readonly unit: string;
  readonly inbound: string;
  readonly outbound: string;
}
export interface InventoryDashboardSummaryDto {
  readonly inboundValue: InventoryAmountDto;
  readonly outboundValue: InventoryAmountDto;
  readonly movementCount: number;
  readonly inventoryValue: InventoryAmountDto;
  readonly quantities: readonly InventoryUnitFlowDto[];
  readonly valuationDate: string;
}
export interface InventoryDashboardChartPointDto {
  readonly date: string;
  readonly inboundValue: InventoryAmountDto;
  readonly outboundValue: InventoryAmountDto;
  readonly movementCount: number;
  readonly quantities: readonly InventoryUnitFlowDto[];
}
export interface RecentInventoryDocumentDto {
  readonly id: string;
  readonly recordType:
    | "invoice"
    | "delivery_note"
    | "debit_note"
    | "credit_note"
    | "other";
  readonly number: string;
  readonly counterparty: string | null;
  readonly date: string;
  readonly status: string;
  readonly total: InventoryAmountDto;
  readonly transactionCurrency: string;
  readonly sourceTotal: string | null;
}
export interface RecentInventoryMovementDto {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSku: string;
  readonly effectiveDate: string;
  readonly movementType: string;
  readonly direction: "inbound" | "outbound";
  readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
  readonly totalCost: InventoryAmountDto;
  readonly reference: string | null;
}
export interface InventoryDashboardDto {
  readonly period: {
    readonly from: string;
    readonly to: string;
    readonly granularity: "day";
  };
  readonly summary: InventoryDashboardSummaryDto;
  readonly charts: readonly InventoryDashboardChartPointDto[];
  readonly recentSales: readonly RecentInventoryDocumentDto[];
  readonly recentPurchases: readonly RecentInventoryDocumentDto[];
  readonly recentInboundMovements: readonly RecentInventoryMovementDto[];
  readonly recentOutboundMovements: readonly RecentInventoryMovementDto[];
  readonly generatedAt: string;
}

export interface SalesAmountDto {
  readonly amount: string;
  readonly currency: "VES";
}
export interface SalesDashboardSummaryDto {
  readonly confirmedInvoicedAmount: SalesAmountDto;
  readonly taxableBaseAmount: SalesAmountDto;
  readonly vatDebitAmount: SalesAmountDto;
  readonly confirmedInvoiceCount: number;
  readonly draftInvoiceCount: number;
  readonly averageTicketAmount: SalesAmountDto;
}
export interface SalesDashboardDailyPointDto {
  readonly date: string;
  readonly confirmedInvoicedAmount: SalesAmountDto;
  readonly taxableBaseAmount: SalesAmountDto;
  readonly vatDebitAmount: SalesAmountDto;
  readonly confirmedInvoiceCount: number;
}
export interface SalesDashboardDocumentDto {
  readonly id: string;
  readonly sourceKind: "legacy_sales_invoice";
  readonly documentType: "invoice";
  readonly invoiceNumber: string;
  readonly customerName: string | null;
  readonly date: string;
  readonly status: "confirmed" | "draft";
  readonly salesChannel: "administrative" | "pos";
  readonly subtotal: SalesAmountDto;
  readonly taxableBase: SalesAmountDto;
  readonly vatAmount: SalesAmountDto;
  readonly total: SalesAmountDto;
  readonly transactionCurrency: string;
  readonly sourceSubtotal: string | null;
  readonly sourceVatAmount: string | null;
  readonly sourceTotal: string | null;
}
export interface SalesDashboardDto {
  readonly period: {
    readonly from: string;
    readonly to: string;
    readonly granularity: "day";
  };
  readonly summary: SalesDashboardSummaryDto;
  readonly charts: readonly SalesDashboardDailyPointDto[];
  readonly recentConfirmedInvoices: readonly SalesDashboardDocumentDto[];
  readonly recentDraftInvoices: readonly SalesDashboardDocumentDto[];
  readonly generatedAt: string;
}

export interface PurchasingAmountDto {
  readonly amount: string;
  readonly currency: "VES";
}
export interface PurchasingTransactionAmountDto {
  readonly amount: string;
  readonly currency: string;
}
export interface PurchasingSupplierDto {
  readonly id: string | null;
  readonly legalName: string;
  readonly taxIdentifier: string | null;
}
export interface PurchasingDashboardSummaryDto {
  readonly confirmedPurchaseTotal: PurchasingAmountDto;
  readonly vatCreditTotal: PurchasingAmountDto;
  readonly vatWithheldTotal: PurchasingAmountDto;
  readonly confirmedDocumentCount: number;
  readonly draftDocumentCount: number;
}
export interface PurchasingDashboardDayDto {
  readonly date: string;
  readonly confirmedPurchaseTotal: PurchasingAmountDto;
  readonly vatCreditTotal: PurchasingAmountDto;
  readonly confirmedDocumentCount: number;
  readonly draftDocumentCount: number;
}
export interface PurchasingTopSupplierDto {
  readonly supplier: PurchasingSupplierDto;
  readonly confirmedPurchaseTotal: PurchasingAmountDto;
  readonly confirmedDocumentCount: number;
}
export interface RecentPurchasingDocumentDto {
  readonly id: string;
  readonly documentType: "invoice" | "credit_note" | "debit_note";
  readonly invoiceNumber: string;
  readonly controlNumber: string | null;
  readonly supplier: PurchasingSupplierDto;
  readonly fiscalDate: string;
  readonly status: "draft" | "confirmed";
  readonly functionalAmounts: {
    readonly subtotal: PurchasingAmountDto;
    readonly vat: PurchasingAmountDto;
    readonly vatWithheld: PurchasingAmountDto;
    readonly total: PurchasingAmountDto;
  };
  readonly transactionCurrency: string;
  readonly transactionAmounts: {
    readonly subtotal: PurchasingTransactionAmountDto | null;
    readonly vat: PurchasingTransactionAmountDto | null;
    readonly total: PurchasingTransactionAmountDto | null;
  };
}
export interface PurchasingDashboardDto {
  readonly period: {
    readonly from: string;
    readonly to: string;
    readonly granularity: "day";
  };
  readonly summary: PurchasingDashboardSummaryDto;
  readonly daily: readonly PurchasingDashboardDayDto[];
  readonly topSuppliers: readonly PurchasingTopSupplierDto[];
  readonly recentDocuments: readonly RecentPurchasingDocumentDto[];
  readonly generatedAt: string;
}

export type InventoryOperationReason =
  | "opening_balance"
  | "purchase_receipt"
  | "sales_issue"
  | "customer_return"
  | "supplier_return"
  | "transfer"
  | "stock_count_adjustment"
  | "self_consumption"
  | "production_consumption"
  | "production_output"
  | "reversal";
export type InventoryOperationStatus = "draft" | "posted" | "reversed";
export type InventoryOperationSourceKind =
  | "purchasing"
  | "sales"
  | "inventory"
  | "production"
  | "migration";
export interface InventoryFlowItemDto {
  readonly id: string;
  readonly operationId: string;
  readonly effectiveDate: string;
  readonly direction: "inbound" | "outbound";
  readonly reason: InventoryOperationReason;
  readonly status: InventoryOperationStatus;
  readonly product: {
    readonly id: string;
    readonly sku: string;
    readonly name: string;
  };
  readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
  readonly unitCost: InventoryAmountDto | null;
  readonly totalCost: InventoryAmountDto | null;
  readonly source: {
    readonly kind: InventoryOperationSourceKind;
    readonly documentId: string;
  };
  readonly reference: string | null;
  readonly notes: string | null;
  readonly postedAt: string | null;
}
export interface InventoryFlowPageDto {
  readonly items: readonly InventoryFlowItemDto[];
  readonly nextCursor: string | null;
  readonly total: number;
  readonly summary: {
    readonly movementCount: number;
    readonly totalValue: InventoryAmountDto;
    readonly quantities: readonly {
      readonly unit: UnitOfMeasure;
      readonly value: string;
    }[];
  };
}
export interface InventoryOperationDetailDto {
  readonly id: string;
  readonly companyId: string;
  readonly reason: InventoryOperationReason;
  readonly effectiveDate: string;
  readonly status: InventoryOperationStatus;
  readonly version: number;
  readonly source: {
    readonly kind: InventoryOperationSourceKind;
    readonly documentId: string;
  };
  readonly reference: string | null;
  readonly notes: string | null;
  readonly postedAt: string | null;
  readonly reversalOf: string | null;
  readonly reversedBy: string | null;
  readonly lines: readonly {
    readonly id: string;
    readonly productId: string;
    readonly productName: string;
    readonly productSku: string;
    readonly direction: "inbound" | "outbound";
    readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
    readonly unitCost: InventoryAmountDto | null;
    readonly movementId: string | null;
  }[];
  readonly capabilities: {
    readonly canPost: boolean;
    readonly canReverse: boolean;
    readonly canEditMetadata: boolean;
  };
}
export interface CreateInventoryOperationDto {
  readonly reason:
    | "opening_balance"
    | "stock_count_adjustment"
    | "self_consumption";
  readonly effectiveDate: string;
  readonly reference?: string | null;
  readonly notes?: string | null;
  readonly lines: readonly {
    readonly productId: string;
    readonly direction: "inbound" | "outbound";
    readonly quantity: string;
    readonly unit: UnitOfMeasure;
    readonly unitCost?: string | null;
  }[];
}
export interface InventoryOperationVersionDto {
  readonly expectedVersion: number;
}
export interface UpdateInventoryOperationDto
  extends InventoryOperationVersionDto {
  readonly effectiveDate?: string;
  readonly reference?: string | null;
  readonly notes?: string | null;
}
export interface ReverseInventoryOperationDto
  extends InventoryOperationVersionDto {
  readonly effectiveDate: string;
  readonly reason: string;
}

export type UnitOfMeasure =
  | "each"
  | "kilogram"
  | "gram"
  | "meter"
  | "square_meter"
  | "cubic_meter"
  | "liter"
  | "gallon"
  | "box"
  | "roll"
  | "package";
export interface ProductCategoryDto {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: "active" | "inactive";
  readonly version: number;
}
export interface ProductCategoryOverviewItemDto extends ProductCategoryDto {
  readonly productCount: number;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}
export interface ProductCategoryOverviewDto {
  readonly items: readonly ProductCategoryOverviewItemDto[];
  readonly nextCursor: string | null;
  readonly total: number;
  readonly summary: {
    readonly active: number;
    readonly inactive: number;
    readonly inUse: number;
    readonly unused: number;
    readonly unassignedProducts: number;
  };
}
export interface ProductInventorySummaryDto {
  readonly onHand: { readonly quantity: string; readonly unit: UnitOfMeasure };
  readonly replenishment: {
    readonly minimumQuantity: string | null;
    readonly state: "available" | "low" | "out";
    readonly version: number;
    readonly updatedAt: string;
  };
  readonly valuation: {
    readonly unitCost: string;
    readonly totalValue: string;
    readonly currency: "VES";
  };
}
export interface ProductDto {
  readonly id: string;
  readonly sku: string;
  readonly barcodes: readonly string[];
  readonly name: string;
  readonly description: string | null;
  readonly category: ProductCategoryDto | null;
  readonly baseUnit: UnitOfMeasure;
  readonly status: "active" | "inactive";
  readonly inventory: ProductInventorySummaryDto | null;
  readonly updatedAt: string;
  readonly version: number;
}
export interface ProductListDto {
  readonly items: readonly ProductDto[];
  readonly nextCursor: string | null;
  readonly total: number;
  readonly summary: {
    readonly active: number;
    readonly inactive: number;
    readonly lowStock: number;
    readonly outOfStock: number;
    readonly inventoryValue: {
      readonly amount: string;
      readonly currency: "VES";
    };
  };
}
export type ProductSalePricingPolicyDto =
  | {
      readonly mode: "fixed";
      readonly amount: string;
      readonly currency: string;
    }
  | {
      readonly mode: "markup";
      readonly percentage: string;
      readonly currency: string;
    };
export interface ProductSalePricingDto {
  readonly policy: ProductSalePricingPolicyDto | null;
  readonly version: number;
  readonly updatedAt: string;
}
export interface UpdateProductSalePricingDto {
  readonly policy: ProductSalePricingPolicyDto | null;
  readonly expectedVersion: number;
}
export interface ProductTaxationDto {
  readonly profileId: string;
  readonly taxCode: string;
  readonly treatment: "taxed" | "exempt" | "exonerated" | "not_subject";
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly resolvedRate: string;
  readonly legalBasis: string;
  readonly ruleVersion: string;
  readonly version: number;
}
export interface UpdateProductTaxationDto {
  readonly treatment: "taxed" | "exempt" | "exonerated" | "not_subject";
  readonly effectiveFrom: string;
  readonly legalBasis: string;
  readonly expectedVersion: number;
}
export interface ProductUnitEconomicsAggregateDto {
  readonly weightedAverageUnitAmount: {
    readonly amount: string;
    readonly currency: "VES";
  };
  readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
  readonly observations: number;
}
export interface ProductUnitEconomicsDto {
  readonly period: {
    readonly from: string;
    readonly to: string;
    readonly granularity: "day" | "week" | "month";
  };
  readonly latestAcquisition: {
    readonly effectiveDate: string;
    readonly sourceUnitAmount: {
      readonly amount: string;
      readonly currency: string;
    };
    readonly unitAmount: { readonly amount: string; readonly currency: "VES" };
    readonly exchangeRate: string | null;
    readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
    readonly reference: string | null;
    readonly documentId: string;
  } | null;
  readonly points: readonly {
    readonly bucketStart: string;
    readonly acquisition: ProductUnitEconomicsAggregateDto | null;
    readonly realizedSale: ProductUnitEconomicsAggregateDto | null;
  }[];
  readonly coverage: {
    readonly confirmedAcquisitions: number;
    readonly confirmedSales: number;
    readonly legacyRecordedOutboundPrices: number;
  };
  readonly generatedAt: string;
}
export interface ProductDetailDto extends ProductDto {
  readonly salePricing: ProductSalePricingDto | null;
  readonly taxation: ProductTaxationDto | null;
  readonly productType: "merchandise";
  readonly valuationMethod: "weighted_average";
  readonly vat: {
    readonly code: "general" | "exempt";
    readonly rate: string;
  } | null;
  readonly capabilities: {
    readonly inventoryEnabled: boolean;
    readonly locationTracking: boolean;
    readonly lotTracking: boolean;
    readonly salePricing: boolean;
    readonly vatConfiguration: boolean;
    readonly valuationMethodChange: boolean;
  };
}
export interface CreateProductDto {
  readonly sku: string;
  readonly barcodes?: readonly string[];
  readonly name: string;
  readonly description?: string | null;
  readonly categoryId?: string | null;
  readonly baseUnit: UnitOfMeasure;
}
export interface UpdateProductDto {
  readonly sku?: string;
  readonly barcodes?: readonly string[];
  readonly name?: string;
  readonly description?: string | null;
  readonly categoryId?: string | null;
  readonly baseUnit?: UnitOfMeasure;
  readonly expectedVersion: number;
}
export interface ProductVersionDto {
  readonly expectedVersion: number;
}
export interface UpdateProductInventoryProfileDto {
  readonly minimumQuantity: string | null;
  readonly expectedVersion: number;
}
export interface ProductReplenishmentPolicyDto {
  readonly productId: string;
  readonly unit: UnitOfMeasure;
  readonly minimumQuantity: string | null;
  readonly version: number;
  readonly updatedAt: string;
}
export interface CreateProductCategoryDto {
  readonly name: string;
  readonly description?: string | null;
}
export interface UpdateProductCategoryDto {
  readonly name?: string;
  readonly description?: string | null;
  readonly expectedVersion: number;
}
export interface ProductMovementDto {
  readonly id: string;
  readonly effectiveDate: string;
  readonly type: string;
  readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
  readonly unitCost: { readonly amount: string; readonly currency: "VES" };
  readonly totalCost: { readonly amount: string; readonly currency: "VES" };
  readonly balanceQuantity: string;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
}
export interface ProductMovementPageDto {
  readonly items: readonly ProductMovementDto[];
  readonly nextCursor: string | null;
}

export interface OrganizationDto {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly role: "owner" | "admin" | "accountant" | "seller" | "cashier";
  readonly permissions: readonly string[];
  readonly logoUrl: string | null;
  readonly version: number;
}
export interface UpdateOrganizationDto {
  readonly name?: string;
  readonly expectedVersion: number;
}
export interface PermissionDto {
  readonly code: string;
  readonly resource: string;
  readonly action: string;
  readonly description: string;
}
export interface RoleDto {
  readonly id: string;
  readonly organizationId: string;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly kind: "system" | "custom";
  readonly permissions: readonly string[];
  readonly status: "active" | "archived";
  readonly version: number;
}
export interface CreateRoleDto {
  readonly name: string;
  readonly description?: string;
  readonly permissions: readonly string[];
}
export interface UpdateRoleDto {
  readonly name?: string;
  readonly description?: string;
  readonly permissions?: readonly string[];
  readonly expectedVersion: number;
}
export interface OrganizationMemberDto {
  readonly id: string;
  readonly kind: "membership" | "invitation";
  readonly organizationId: string;
  readonly userId: string | null;
  readonly email: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly roleId: string;
  readonly roleName: string;
  readonly status: "active" | "invited" | "suspended";
  readonly version: number;
  readonly joinedAt: string | null;
  readonly invitedAt: string | null;
  readonly expiresAt: string | null;
}
export interface CreateMemberInvitationDto {
  readonly email: string;
  readonly roleId: string;
  readonly expiresInDays?: number;
}
export interface ResendMemberInvitationDto {
  readonly expectedVersion: number;
  readonly expiresInDays?: number;
}
export interface UpdateMembershipDto {
  readonly roleId?: string;
  readonly status?: "active" | "suspended";
  readonly expectedVersion: number;
}
export interface DocumentFolderDto {
  readonly id: string;
  readonly organizationId: string;
  readonly companyId: string | null;
  readonly parentId: string | null;
  readonly name: string;
  readonly createdBy: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface DocumentDto {
  readonly id: string;
  readonly organizationId: string;
  readonly companyId: string | null;
  readonly folderId: string | null;
  readonly name: string;
  readonly contentType: string | null;
  readonly sizeBytes: number | null;
  readonly uploadedBy: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface CreateDocumentFolderDto {
  readonly name: string;
  readonly companyId?: string | null;
  readonly parentId?: string | null;
}
export interface RenameDocumentFolderDto {
  readonly name: string;
  readonly expectedVersion: number;
}
export interface CreateDocumentUploadDto {
  readonly fileName: string;
}
export interface RegisterDocumentDto {
  readonly name: string;
  readonly storageKey: string;
  readonly companyId?: string | null;
  readonly folderId?: string | null;
  readonly contentType?: string | null;
  readonly sizeBytes?: number | null;
}
export interface MoveDocumentDto {
  readonly folderId: string | null;
  readonly expectedVersion: number;
}

export interface OrganizationCompanyDto {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly rif: string | null;
  readonly logoUrl: string | null;
}

export interface CompanyDto {
  readonly id: string;
  readonly organizationId: string;
  readonly legacyCompanyId: string | null;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: string | null;
  readonly country: string;
  readonly status: string;
}
export interface EmployeeDto {
  readonly id: string;
  readonly companyId: string;
  readonly legacyEmployeeId: string | null;
  readonly nationalId: string;
  readonly fullName: string;
  readonly position: string;
  readonly hiredOn: string | null;
  readonly employmentType: string;
  readonly status: string;
  readonly monthlySalaryMinor: string;
  readonly currency: string;
  readonly compensationEffectiveFrom: string;
  readonly version: number;
}

export interface OrganizationAccessPathDto {
  readonly kind: string;
  readonly actorUserId: string;
  readonly actingOrganizationId: string;
  readonly targetOrganizationId: string;
  readonly delegationId: string | null;
  readonly scopes: readonly string[];
}

export interface AccessibleOrganizationDto {
  readonly organizationId: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly relationship: OrganizationRelationship;
  readonly accessPath: OrganizationAccessPathDto;
}

export type OrganizationRelationship = "personal" | "member" | "delegated";

export interface MoneyDto {
  readonly minorAmount: string;
  readonly currency: "USD" | "VES";
}
export interface BillingAccountDto {
  readonly id: string;
  readonly organizationId: string;
  readonly legalName: string;
  readonly taxId: string | null;
  readonly billingEmail: string | null;
  readonly countryCode: string;
  readonly currency: "USD" | "VES";
}
export interface SubscriptionDto {
  readonly id: string;
  readonly productCode: string;
  readonly planId: string | null;
  readonly planName: string | null;
  readonly status: string;
  readonly billingCycle: string | null;
  readonly currentPeriodStart: string | null;
  readonly currentPeriodEnd: string | null;
}
export interface EntitlementsDto {
  readonly maxCompanies: number | null;
  readonly maxMembers: number | null;
  readonly maxDevices: number | null;
  readonly enabledModules: readonly string[];
}
export interface LimitDto {
  readonly used: number;
  readonly maximum: number | null;
  readonly remaining: number | null;
}
export interface UsageDto {
  readonly companies: LimitDto;
  readonly members: LimitDto;
  readonly devices: LimitDto;
}
export interface InvoiceDto {
  readonly id: string;
  readonly number: string;
  readonly status: string;
  readonly subtotal: MoneyDto;
  readonly tax: MoneyDto;
  readonly total: MoneyDto;
  readonly issuedAt: string | null;
  readonly dueAt: string | null;
  readonly paidAt: string | null;
}
export interface PaymentMethodDto {
  readonly id: string;
  readonly kind: string;
  readonly provider: string;
  readonly displayLabel: string;
  readonly isDefault: boolean;
}
export interface BillingPlanDto {
  readonly id: string;
  readonly name: string;
  readonly maxCompanies: number | null;
  readonly maxEmployeesPerCompany: number | null;
  readonly monthlyPrice: MoneyDto;
  readonly quarterlyPrice: MoneyDto;
  readonly annualPrice: MoneyDto;
  readonly productCode: string | null;
  readonly contactOnly: boolean;
}
export interface ManualPaymentRequestDto {
  readonly id: string;
  readonly planId: string;
  readonly billingCycle: "monthly" | "quarterly" | "annual";
  readonly amount: MoneyDto;
  readonly discount: MoneyDto;
  readonly paymentMethod: "transfer" | "cash" | "credit";
  readonly hasReceipt: boolean;
  readonly status: "pending" | "approved" | "rejected";
  readonly notes: string | null;
  readonly submittedAt: string;
  readonly reviewedAt: string | null;
}
export interface SubmitManualPaymentRequestDto {
  readonly planId: string;
  readonly billingCycle: "monthly" | "quarterly" | "annual";
  readonly paymentMethod: "transfer" | "cash";
  readonly receiptStorageKey?: string | null;
}
export interface CreatePaymentReceiptUploadDto {
  readonly fileName: string;
  readonly contentType: string;
}
export interface PaymentReceiptUploadDto {
  readonly uploadUrl: string;
  readonly storageKey: string;
}
export interface BillingOverviewDto {
  readonly account: BillingAccountDto;
  readonly subscriptions: readonly SubscriptionDto[];
  readonly entitlements: EntitlementsDto;
  readonly usage: UsageDto;
}

export type PortalAvailability =
  | "operational"
  | "degraded"
  | "down"
  | "unknown";

export interface PortalStatusDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly category: "fiscal" | "laboral" | "mercantil";
  readonly logoUrl: string | null;
  readonly status: PortalAvailability;
  readonly responseTimeMs: number | null;
  readonly checkedAt: string | null;
}

export interface PlatformStatusDto {
  readonly status: PortalAvailability;
  readonly observedAt: string | null;
  readonly summary: {
    readonly operational: number;
    readonly degraded: number;
    readonly down: number;
    readonly unknown: number;
    readonly total: number;
  };
  readonly portals: readonly PortalStatusDto[];
}

export interface ReferralAttributionDto {
  readonly id: string;
  readonly referrerOrganizationId: string;
  readonly referredOrganizationId: string;
  readonly code: string;
  readonly status: string;
  readonly attributedAt: string;
}

export interface ReferralRewardDto {
  readonly id: string;
  readonly beneficiaryOrganizationId: string;
  readonly referredOrganizationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly rewardType: string;
  readonly configuredValue: number;
  readonly calculatedCredit: MoneyDto;
  readonly sourceInvoiceId: string;
  readonly status: string;
}

export interface ReferralOverviewDto {
  readonly code: string;
  readonly referredBy: string | null;
  readonly attributions: number;
  readonly rewards: readonly ReferralRewardDto[];
  readonly balance: MoneyDto;
}
export interface PaymentDto {
  readonly id: string;
  readonly organizationId: string;
  readonly invoiceId: string;
  readonly provider: string;
  readonly providerReference: string;
  readonly amount: MoneyDto;
  readonly status: string;
  readonly confirmedAt: string | null;
  readonly createdAt: string;
}
export interface BillingCreditApplicationDto {
  readonly id: string;
  readonly organizationId: string;
  readonly invoiceId: string;
  readonly entryId: string;
  readonly amount: MoneyDto;
  readonly appliedAt: string;
}
