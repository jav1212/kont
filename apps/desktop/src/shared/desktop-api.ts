import type { AuthenticationFailureCode } from "@kontave/auth-domain";
import type { DeviceDescriptor, DeviceEvent, DeviceLifecycleState } from "@kontave/device-contracts";
import type { ClientUpdateSnapshot } from "@kontave/client-updates-contracts";
import type { ConnectivitySnapshot } from "@kontave/client-connectivity-contracts";
import type {
  NativeAuthenticatedDeviceSessionDto,
  NativeBillingOverviewDto,
  NativeBillingPlanDto,
  NativeCurrentUserDto,
  NativeDocumentDto,
  NativeInventoryDashboardDto,
  NativeSalesDashboardDto,
  NativePurchasingDashboardDto,
  NativeInventoryFlowPageDto,
  NativeInventoryOperationDetailDto,
  NativeCreateInventoryOperationDto,
  NativeUpdateInventoryOperationDto,
  NativeReverseInventoryOperationDto,
  NativeExchangeRateSetDto,
  NativeOperationalDefaultsDto,
  NativeCreateProductCategoryDto,
  NativeCreateProductDto,
  NativeProductCategoryDto,
  NativeProductCategoryOverviewDto,
  NativeProductCategoryOverviewItemDto,
  NativeProductDetailDto,
  NativeProductDto,
  NativeProductListDto,
  NativeProductMovementPageDto,
  NativeProductSalePricingDto,
  NativeProductTaxationDto,
  NativeProductUnitEconomicsDto,
  NativeUpdateProductSalePricingDto,
  NativeUpdateProductTaxationDto,
  NativeProductReplenishmentPolicyDto,
  NativeUpdateProductCategoryDto,
  NativeUpdateProductDto,
  NativeUpdateProductInventoryProfileDto,
  NativeManualPaymentRequestDto,
  NativeOrganizationDto,
  NativeOrganizationMemberDto,
  NativeRoleDto,
  NativeUpdateCurrentUserDto,
  NativeUpdateOrganizationDto,
  NativeUpdateUserPreferencesDto,
  NativeUserPreferencesDto,
} from "@kontave/native-api-contracts";

export const DESKTOP_IPC = {
  getAuthState: "auth:state",
  signIn: "auth:sign-in",
  register: "auth:register",
  verifyRegistration: "auth:verify-registration",
  resendRegistration: "auth:resend-registration",
  requestPasswordRecovery: "auth:request-password-recovery",
  verifyPasswordRecovery: "auth:verify-password-recovery",
  completePasswordRecovery: "auth:complete-password-recovery",
  signOut: "auth:sign-out",
  authStateChanged: "auth:state-changed",
  connectDevice: "devices:connect",
  disconnectDevice: "devices:disconnect",
  getDeviceStatus: "devices:status",
  deviceEvent: "devices:event",
  getUpdateState: "updates:state",
  checkForUpdate: "updates:check",
  downloadUpdate: "updates:download",
  applyUpdate: "updates:apply",
  updateStateChanged: "updates:state-changed",
  getWorkspaceState: "workspace:state",
  refreshWorkspace: "workspace:refresh",
  selectWorkspace: "workspace:select",
  selectWorkspaceModule: "workspace:module-select",
  selectWorkspaceCompany: "workspace:company-select",
  workspaceStateChanged: "workspace:state-changed",
  getCurrentUser: "profile:current",
  currentUserChanged: "profile:current-changed",
  getBillingPlan: "billing:plan",
  billingPlanChanged: "billing:plan-changed",
  getPlatformStatus: "platform:status",
  platformStatusChanged: "platform:status-changed",
  openExternalDestination: "navigation:open-external",
  getConnectivitySnapshot: "connectivity:snapshot",
  refreshConnectivity: "connectivity:refresh",
  connectivityChanged: "connectivity:changed",
  getSettingsSnapshot: "settings:snapshot",
  updateSettingsProfile: "settings:profile-update",
  updateSettingsPreferences: "settings:preferences-update",
  updateSettingsOrganization: "settings:organization-update",
  changeSettingsPassword: "settings:password-change",
  revokeSettingsSession: "settings:session-revoke",
  revokeOtherSettingsSessions: "settings:sessions-revoke-others",
  getInventoryDashboard: "inventory:dashboard",
  getSalesDashboard: "sales:dashboard",
  getPurchasingDashboard: "purchasing:dashboard",
  listInventoryEntries: "inventory:entries",
  listInventoryOutputs: "inventory:outputs",
  listInventoryOperations: "inventory:operations",
  getInventoryOperation: "inventory:operation-get",
  createInventoryOperation: "inventory:operation-create",
  updateInventoryOperation: "inventory:operation-update",
  postInventoryOperation: "inventory:operation-post",
  reverseInventoryOperation: "inventory:operation-reverse",
  listProducts: "products:list",
  getProductPermissions: "products:permissions",
  getProduct: "products:get",
  createProduct: "products:create",
  updateProduct: "products:update",
  setProductStatus: "products:status",
  listProductMovements: "products:movements",
  updateProductInventoryProfile: "products:inventory-profile",
  listProductCategories: "products:categories-list",
  createProductCategory: "products:categories-create",
  updateProductCategory: "products:categories-update",
  setProductCategoryStatus: "products:categories-status",
  getProductCategory: "products:categories-get",
  listProductCategoryOverview: "products:categories-overview",
  getProductUnitEconomics: "products:unit-economics",
  updateProductSalePricing: "products:sale-pricing-update",
  updateProductTaxation: "products:taxation-update",
} as const;

export interface DesktopProductListQuery { readonly search?: string;readonly status?: "active"|"inactive"|"all";readonly categoryId?: string;readonly stock?: "all"|"available"|"low"|"out";readonly sort?: "name"|"sku"|"stock"|"value"|"updatedAt";readonly direction?: "asc"|"desc";readonly cursor?: string;readonly limit?: number }
export interface DesktopProductMovementQuery { readonly cursor?: string;readonly limit?: number;readonly from?: string;readonly to?: string;readonly type?: string }
export interface DesktopProductCategoryOverviewQuery { readonly search?:string;readonly status?:"active"|"inactive"|"all";readonly sort?:"name"|"products"|"updatedAt";readonly direction?:"asc"|"desc";readonly cursor?:string;readonly limit?:number }
export interface DesktopProductInsightsQuery {readonly from:string;readonly to:string;readonly granularity:"day"|"week"|"month"}
export type DesktopProductsResult<T> = { readonly ok:true;readonly value:T } | { readonly ok:false;readonly error:{readonly code:string;readonly message:string;readonly requestId:string|null} };

export interface DesktopInventoryDashboardSnapshot {
  readonly operationContext: NativeOperationalDefaultsDto;
  readonly exchangeRates: NativeExchangeRateSetDto;
  readonly dashboard: NativeInventoryDashboardDto;
}

export interface DesktopInventoryDashboardQuery {
  readonly from?: string;
  readonly to?: string;
}

export type DesktopInventoryDashboardResult =
  | { readonly ok: true; readonly value: DesktopInventoryDashboardSnapshot }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string; readonly requestId: string | null } };

export interface DesktopSalesDashboardSnapshot {readonly operationContext:NativeOperationalDefaultsDto;readonly exchangeRates:NativeExchangeRateSetDto;readonly dashboard:NativeSalesDashboardDto}
export interface DesktopSalesDashboardQuery {
  readonly from?: string;
  readonly to?: string;
  readonly granularity?: "day";
  readonly recentLimit?: number;
}
export type DesktopSalesDashboardResult={readonly ok:true;readonly value:DesktopSalesDashboardSnapshot}|{readonly ok:false;readonly error:{readonly code:string;readonly message:string;readonly requestId:string|null}};

export interface DesktopPurchasingDashboardSnapshot{readonly operationContext:NativeOperationalDefaultsDto;readonly exchangeRates:NativeExchangeRateSetDto;readonly dashboard:NativePurchasingDashboardDto}
export interface DesktopPurchasingDashboardQuery{readonly from?:string;readonly to?:string;readonly recentLimit?:number}
export type DesktopPurchasingDashboardResult={readonly ok:true;readonly value:DesktopPurchasingDashboardSnapshot}|{readonly ok:false;readonly error:{readonly code:string;readonly message:string;readonly requestId:string|null}};

export interface DesktopInventoryFlowQuery {
  readonly from: string; readonly to: string; readonly reason?: string; readonly sourceKind?: string;
  readonly productId?: string; readonly status?: "draft" | "posted" | "reversed";
  readonly search?: string; readonly cursor?: string; readonly limit?: number;
}
export type DesktopInventoryResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string; readonly requestId: string | null } };

export interface DesktopSettingsSnapshot {
  readonly profile: NativeCurrentUserDto;
  readonly preferences: NativeUserPreferencesDto;
  readonly organization: NativeOrganizationDto | null;
  readonly sessions: readonly NativeAuthenticatedDeviceSessionDto[];
  readonly members: readonly NativeOrganizationMemberDto[];
  readonly roles: readonly NativeRoleDto[];
  readonly billing: NativeBillingOverviewDto | null;
  readonly billingPlans: readonly NativeBillingPlanDto[];
  readonly paymentRequests: readonly NativeManualPaymentRequestDto[];
  readonly documents: readonly NativeDocumentDto[];
}

export type DesktopSettingsResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string; readonly requestId: string | null } };

export interface DesktopAuthUser {
  readonly id: string;
  readonly email: string | null;
}

export type DesktopCurrentUserState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | {
    readonly status: "ready";
    readonly user: {
      readonly userId: string;
      readonly email: string | null;
      readonly displayName: string | null;
      readonly avatarUrl: string | null;
    };
  };

export type DesktopExternalDestination = "settings" | "profile" | "help" | "billing" | "status";

export type DesktopBillingPlanState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | { readonly status: "ready"; readonly organizationId: string; readonly planName: string | null };

export type DesktopPlatformStatusState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | {
    readonly status: "ready";
    readonly availability: "operational" | "degraded" | "down" | "unknown";
    readonly observedAt: string | null;
  };

export type DesktopExternalNavigationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: { readonly message: string } };

export type DesktopAuthState =
  | { readonly status: "loading" }
  | { readonly status: "anonymous" }
  | { readonly status: "authenticated"; readonly user: DesktopAuthUser };

export interface DesktopAuthError {
  readonly code: AuthenticationFailureCode | "UNEXPECTED";
  readonly message: string;
}

export type DesktopAuthResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DesktopAuthError };

export interface DesktopEmailPasswordCommand {
  readonly email: string;
  readonly password: string;
}

export interface DesktopEmailCodeCommand {
  readonly email: string;
  readonly code: string;
}

export interface DesktopEmailCommand {
  readonly email: string;
}

export interface DesktopPasswordCommand {
  readonly password: string;
}

export interface DesktopPendingEmail {
  readonly email: string;
}

export interface DesktopDeviceStatus {
  readonly state: DeviceLifecycleState;
  readonly device?: DeviceDescriptor;
}

export interface DesktopWorkspaceEntry {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly access: "direct" | "delegated";
  readonly relationship: "personal" | "member" | "delegated";
  readonly scopes: readonly string[];
}

export interface DesktopWorkspaceModuleEntry {
  readonly id: string;
  readonly name: string;
}

export interface DesktopWorkspaceCompanyEntry {
  readonly id: string;
  readonly name: string;
  readonly rif: string | null;
  readonly logoUrl?: string;
}

export type DesktopWorkspaceState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | {
    readonly status: "ready";
    readonly workspaces: readonly DesktopWorkspaceEntry[];
    readonly activeWorkspaceId: string | null;
    readonly modules: readonly DesktopWorkspaceModuleEntry[];
    readonly activeModuleId: string | null;
    readonly companies: readonly DesktopWorkspaceCompanyEntry[];
    readonly activeCompanyId: string | null;
  };

export type DesktopWorkspaceResult =
  | { readonly ok: true; readonly value: DesktopWorkspaceState }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

export interface KontaveDesktopApi {
  readonly auth: {
    getState(): Promise<DesktopAuthState>;
    signIn(command: DesktopEmailPasswordCommand): Promise<DesktopAuthResult<DesktopAuthState>>;
    register(command: DesktopEmailPasswordCommand): Promise<DesktopAuthResult<DesktopPendingEmail>>;
    verifyRegistration(command: DesktopEmailCodeCommand): Promise<DesktopAuthResult<DesktopAuthState>>;
    resendRegistration(command: DesktopEmailCommand): Promise<DesktopAuthResult<null>>;
    requestPasswordRecovery(command: DesktopEmailCommand): Promise<DesktopAuthResult<DesktopPendingEmail>>;
    verifyPasswordRecovery(command: DesktopEmailCodeCommand): Promise<DesktopAuthResult<DesktopPendingEmail>>;
    completePasswordRecovery(command: DesktopPasswordCommand): Promise<DesktopAuthResult<DesktopAuthState>>;
    signOut(): Promise<DesktopAuthResult<DesktopAuthState>>;
    subscribe(listener: (state: DesktopAuthState) => void): () => void;
  };
  readonly devices: {
    connect(): Promise<DesktopDeviceStatus>;
    disconnect(): Promise<DesktopDeviceStatus>;
    getStatus(): Promise<DesktopDeviceStatus>;
    subscribe(listener: (event: DeviceEvent) => void): () => void;
  };
  readonly updates: {
    getState(): Promise<ClientUpdateSnapshot>;
    check(): Promise<ClientUpdateSnapshot>;
    download(): Promise<ClientUpdateSnapshot>;
    apply(): Promise<ClientUpdateSnapshot>;
    subscribe(listener: (state: ClientUpdateSnapshot) => void): () => void;
  };
  readonly workspace: {
    getState(): Promise<DesktopWorkspaceState>;
    refresh(): Promise<DesktopWorkspaceResult>;
    select(workspaceId: string): Promise<DesktopWorkspaceResult>;
    selectModule(moduleId: string): Promise<DesktopWorkspaceResult>;
    selectCompany(companyId: string): Promise<DesktopWorkspaceResult>;
    subscribe(listener: (state: DesktopWorkspaceState) => void): () => void;
  };
  readonly profile: {
    getCurrent(): Promise<DesktopCurrentUserState>;
    subscribe(listener: (state: DesktopCurrentUserState) => void): () => void;
  };
  readonly billing: {
    getPlan(): Promise<DesktopBillingPlanState>;
    subscribe(listener: (state: DesktopBillingPlanState) => void): () => void;
  };
  readonly platformStatus: {
    getCurrent(): Promise<DesktopPlatformStatusState>;
    subscribe(listener: (state: DesktopPlatformStatusState) => void): () => void;
  };
  readonly navigation: {
    openExternal(destination: DesktopExternalDestination): Promise<DesktopExternalNavigationResult>;
  };
  readonly connectivity: {
    getSnapshot(): Promise<ConnectivitySnapshot>;
    refresh(): Promise<ConnectivitySnapshot>;
    subscribe(listener: (snapshot: ConnectivitySnapshot) => void): () => void;
  };
  readonly settings: {
    getSnapshot(organizationId: string | null, companyId: string | null): Promise<DesktopSettingsResult<DesktopSettingsSnapshot>>;
    updateProfile(command: NativeUpdateCurrentUserDto): Promise<DesktopSettingsResult<NativeCurrentUserDto>>;
    updatePreferences(command: NativeUpdateUserPreferencesDto): Promise<DesktopSettingsResult<NativeUserPreferencesDto>>;
    updateOrganization(organizationId: string, command: NativeUpdateOrganizationDto): Promise<DesktopSettingsResult<NativeOrganizationDto>>;
    changePassword(newPassword: string, revokeOtherSessions: boolean): Promise<DesktopSettingsResult<{ readonly changed: boolean }>>;
    revokeSession(sessionId: string): Promise<DesktopSettingsResult<{ readonly revoked: boolean }>>;
    revokeOtherSessions(): Promise<DesktopSettingsResult<{ readonly revoked: boolean }>>;
  };
  readonly inventory: {
    getDashboard(userId: string, organizationId: string, companyId: string, query?: DesktopInventoryDashboardQuery): Promise<DesktopInventoryDashboardResult>;
    entries(organizationId:string,companyId:string,query:DesktopInventoryFlowQuery):Promise<DesktopInventoryResult<NativeInventoryFlowPageDto>>;
    outputs(organizationId:string,companyId:string,query:DesktopInventoryFlowQuery):Promise<DesktopInventoryResult<NativeInventoryFlowPageDto>>;
    operations(organizationId:string,companyId:string,query:DesktopInventoryFlowQuery):Promise<DesktopInventoryResult<NativeInventoryFlowPageDto>>;
    operation(organizationId:string,companyId:string,operationId:string):Promise<DesktopInventoryResult<NativeInventoryOperationDetailDto>>;
    createOperation(organizationId:string,companyId:string,command:NativeCreateInventoryOperationDto):Promise<DesktopInventoryResult<NativeInventoryOperationDetailDto>>;
    updateOperation(organizationId:string,companyId:string,operationId:string,command:NativeUpdateInventoryOperationDto):Promise<DesktopInventoryResult<NativeInventoryOperationDetailDto>>;
    postOperation(organizationId:string,companyId:string,operationId:string,expectedVersion:number):Promise<DesktopInventoryResult<NativeInventoryOperationDetailDto>>;
    reverseOperation(organizationId:string,companyId:string,operationId:string,command:NativeReverseInventoryOperationDto):Promise<DesktopInventoryResult<NativeInventoryOperationDetailDto>>;
  };
  readonly sales:{getDashboard(userId:string,organizationId:string,companyId:string,query?:DesktopSalesDashboardQuery):Promise<DesktopSalesDashboardResult>};
  readonly purchasing:{getDashboard(userId:string,organizationId:string,companyId:string,query?:DesktopPurchasingDashboardQuery):Promise<DesktopPurchasingDashboardResult>};
  readonly products: {
    permissions(organizationId:string):Promise<DesktopProductsResult<readonly string[]>>;
    list(organizationId:string,companyId:string,query?:DesktopProductListQuery):Promise<DesktopProductsResult<NativeProductListDto>>;
    get(organizationId:string,companyId:string,productId:string):Promise<DesktopProductsResult<NativeProductDetailDto>>;
    create(organizationId:string,companyId:string,command:NativeCreateProductDto):Promise<DesktopProductsResult<NativeProductDto>>;
    update(organizationId:string,companyId:string,productId:string,command:NativeUpdateProductDto):Promise<DesktopProductsResult<NativeProductDto>>;
    setStatus(organizationId:string,companyId:string,productId:string,active:boolean,expectedVersion:number):Promise<DesktopProductsResult<NativeProductDto>>;
    movements(organizationId:string,companyId:string,productId:string,query?:DesktopProductMovementQuery):Promise<DesktopProductsResult<NativeProductMovementPageDto>>;
    updateInventoryProfile(organizationId:string,companyId:string,productId:string,command:NativeUpdateProductInventoryProfileDto):Promise<DesktopProductsResult<NativeProductReplenishmentPolicyDto>>;
    categories(organizationId:string,companyId:string,status?:"active"|"inactive"|"all"):Promise<DesktopProductsResult<readonly NativeProductCategoryDto[]>>;
    createCategory(organizationId:string,companyId:string,command:NativeCreateProductCategoryDto):Promise<DesktopProductsResult<NativeProductCategoryDto>>;
    updateCategory(organizationId:string,companyId:string,categoryId:string,command:NativeUpdateProductCategoryDto):Promise<DesktopProductsResult<NativeProductCategoryDto>>;
    setCategoryStatus(organizationId:string,companyId:string,categoryId:string,active:boolean,expectedVersion:number):Promise<DesktopProductsResult<NativeProductCategoryDto>>;
    getCategory(organizationId:string,companyId:string,categoryId:string):Promise<DesktopProductsResult<NativeProductCategoryOverviewItemDto>>;
    categoryOverview(organizationId:string,companyId:string,query?:DesktopProductCategoryOverviewQuery):Promise<DesktopProductsResult<NativeProductCategoryOverviewDto>>;
    unitEconomics(organizationId:string,companyId:string,productId:string,query:DesktopProductInsightsQuery):Promise<DesktopProductsResult<NativeProductUnitEconomicsDto>>;
    updateSalePricing(organizationId:string,companyId:string,productId:string,command:NativeUpdateProductSalePricingDto):Promise<DesktopProductsResult<NativeProductSalePricingDto>>;
    updateTaxation(organizationId:string,companyId:string,productId:string,command:NativeUpdateProductTaxationDto):Promise<DesktopProductsResult<NativeProductTaxationDto>>;
  };
}
