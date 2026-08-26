import type {
  AuthenticationPort,
  BillingPort,
  ClientPortFeature,
  InventoryPort,
  KontaveClient,
  OperationContextPort,
  OrganizationsPort,
  PortalMonitoringPort,
  ProductsPort,
  ProfilePort,
  PurchasingPort,
  SalesPort,
} from "@kontave/client-contracts";
import { createKontaveClient, type ClientRuntimeModule } from "./lifecycle";
import { createPortFeature } from "./features/port-feature";

/** Portable application ports required by the connected Kontave client. */
export interface KontaveClientPorts {
  readonly authentication: AuthenticationPort;
  readonly billing: BillingPort;
  readonly inventory: InventoryPort;
  readonly operationContext: OperationContextPort;
  readonly organizations: OrganizationsPort;
  readonly portalMonitoring: PortalMonitoringPort;
  readonly products: ProductsPort;
  readonly profile: ProfilePort;
  readonly purchasing: PurchasingPort;
  readonly sales: SalesPort;
}

/** Exhaustive portable feature catalog shared by every Kontave renderer. */
export type KontaveClientFeatures = {
  readonly authentication: ClientPortFeature<AuthenticationPort>;
  readonly billing: ClientPortFeature<BillingPort>;
  readonly inventory: ClientPortFeature<InventoryPort>;
  readonly operationContext: ClientPortFeature<OperationContextPort>;
  readonly organizations: ClientPortFeature<OrganizationsPort>;
  readonly portalMonitoring: ClientPortFeature<PortalMonitoringPort>;
  readonly products: ClientPortFeature<ProductsPort>;
  readonly profile: ClientPortFeature<ProfilePort>;
  readonly purchasing: ClientPortFeature<PurchasingPort>;
  readonly sales: ClientPortFeature<SalesPort>;
};

/** Options used to compose one portable application client. */
export interface KontaveApplicationClientOptions {
  readonly ports: KontaveClientPorts;
  readonly modules?: readonly ClientRuntimeModule[];
  readonly observeUnexpectedFailure?: (cause: unknown) => void;
}

/**
 * Composes the complete portable client over concrete application ports.
 * @param options - Required ports, optional platform modules, and failure observer.
 * @returns A lifecycle-managed client with an exhaustive feature registry.
 */
export function createKontaveApplicationClient(
  options: KontaveApplicationClientOptions,
): KontaveClient<KontaveClientFeatures> {
  const authentication = createPortFeature<AuthenticationPort>({
    sessions: () => options.ports.authentication.sessions(),
    changePassword: (command) =>
      options.ports.authentication.changePassword(command),
    revokeSession: (sessionId) =>
      options.ports.authentication.revokeSession(sessionId),
    revokeOtherSessions: () =>
      options.ports.authentication.revokeOtherSessions(),
  });
  const billing = createPortFeature<BillingPort>({
    overview: (organizationId) =>
      options.ports.billing.overview(organizationId),
    plans: (organizationId) => options.ports.billing.plans(organizationId),
    paymentRequests: (organizationId) =>
      options.ports.billing.paymentRequests(organizationId),
  });
  const inventory = createPortFeature<InventoryPort>({
    dashboard: (organizationId, companyId, query) =>
      options.ports.inventory.dashboard(organizationId, companyId, query),
    entries: (organizationId, companyId, query) =>
      options.ports.inventory.entries(organizationId, companyId, query),
    outputs: (organizationId, companyId, query) =>
      options.ports.inventory.outputs(organizationId, companyId, query),
    operations: (organizationId, companyId, query) =>
      options.ports.inventory.operations(organizationId, companyId, query),
    operation: (organizationId, companyId, operationId) =>
      options.ports.inventory.operation(organizationId, companyId, operationId),
    create: (organizationId, companyId, command) =>
      options.ports.inventory.create(organizationId, companyId, command),
    update: (organizationId, companyId, operationId, command) =>
      options.ports.inventory.update(
        organizationId,
        companyId,
        operationId,
        command,
      ),
    post: (organizationId, companyId, operationId, expectedVersion) =>
      options.ports.inventory.post(
        organizationId,
        companyId,
        operationId,
        expectedVersion,
      ),
    reverse: (organizationId, companyId, operationId, command) =>
      options.ports.inventory.reverse(
        organizationId,
        companyId,
        operationId,
        command,
      ),
  });
  const operationContext = createPortFeature<OperationContextPort>({
    get: (organizationId, companyId) =>
      options.ports.operationContext.get(organizationId, companyId),
    update: (organizationId, companyId, command) =>
      options.ports.operationContext.update(organizationId, companyId, command),
    exchangeRates: (organizationId, companyId, date) =>
      options.ports.operationContext.exchangeRates(
        organizationId,
        companyId,
        date,
      ),
  });
  const organizations = createPortFeature<OrganizationsPort>({
    accessible: () => options.ports.organizations.accessible(),
    get: (organizationId) => options.ports.organizations.get(organizationId),
    update: (organizationId, command) =>
      options.ports.organizations.update(organizationId, command),
    companies: (organizationId) =>
      options.ports.organizations.companies(organizationId),
    operationalCompanies: (organizationId) =>
      options.ports.organizations.operationalCompanies(organizationId),
    modules: (organizationId, platform) =>
      options.ports.organizations.modules(organizationId, platform),
    members: (organizationId) =>
      options.ports.organizations.members(organizationId),
    roles: (organizationId) =>
      options.ports.organizations.roles(organizationId),
  });
  const portalMonitoring = createPortFeature<PortalMonitoringPort>({
    current: () => options.ports.portalMonitoring.current(),
  });
  const products = createPortFeature<ProductsPort>({
    permissions: (organizationId) =>
      options.ports.products.permissions(organizationId),
    list: (organizationId, companyId, query) =>
      options.ports.products.list(organizationId, companyId, query),
    get: (organizationId, companyId, productId) =>
      options.ports.products.get(organizationId, companyId, productId),
    create: (organizationId, companyId, command) =>
      options.ports.products.create(organizationId, companyId, command),
    update: (organizationId, companyId, productId, command) =>
      options.ports.products.update(
        organizationId,
        companyId,
        productId,
        command,
      ),
    setStatus: (
      organizationId,
      companyId,
      productId,
      active,
      expectedVersion,
    ) =>
      options.ports.products.setStatus(
        organizationId,
        companyId,
        productId,
        active,
        expectedVersion,
      ),
    movements: (organizationId, companyId, productId, query) =>
      options.ports.products.movements(
        organizationId,
        companyId,
        productId,
        query,
      ),
    updateInventoryProfile: (organizationId, companyId, productId, command) =>
      options.ports.products.updateInventoryProfile(
        organizationId,
        companyId,
        productId,
        command,
      ),
    categories: (organizationId, companyId, status) =>
      options.ports.products.categories(organizationId, companyId, status),
    createCategory: (organizationId, companyId, command) =>
      options.ports.products.createCategory(organizationId, companyId, command),
    updateCategory: (organizationId, companyId, categoryId, command) =>
      options.ports.products.updateCategory(
        organizationId,
        companyId,
        categoryId,
        command,
      ),
    setCategoryStatus: (
      organizationId,
      companyId,
      categoryId,
      active,
      expectedVersion,
    ) =>
      options.ports.products.setCategoryStatus(
        organizationId,
        companyId,
        categoryId,
        active,
        expectedVersion,
      ),
    getCategory: (organizationId, companyId, categoryId) =>
      options.ports.products.getCategory(organizationId, companyId, categoryId),
    categoryOverview: (organizationId, companyId, query) =>
      options.ports.products.categoryOverview(organizationId, companyId, query),
    unitEconomics: (organizationId, companyId, productId, query) =>
      options.ports.products.unitEconomics(
        organizationId,
        companyId,
        productId,
        query,
      ),
    updateSalePricing: (organizationId, companyId, productId, command) =>
      options.ports.products.updateSalePricing(
        organizationId,
        companyId,
        productId,
        command,
      ),
    updateTaxation: (organizationId, companyId, productId, command) =>
      options.ports.products.updateTaxation(
        organizationId,
        companyId,
        productId,
        command,
      ),
  });
  const profile = createPortFeature<ProfilePort>({
    current: () => options.ports.profile.current(),
    preferences: () => options.ports.profile.preferences(),
    update: (command) => options.ports.profile.update(command),
    updatePreferences: (command) =>
      options.ports.profile.updatePreferences(command),
  });
  const purchasing = createPortFeature<PurchasingPort>({
    dashboard: (organizationId, companyId, query) =>
      options.ports.purchasing.dashboard(organizationId, companyId, query),
  });
  const sales = createPortFeature<SalesPort>({
    dashboard: (organizationId, companyId, query) =>
      options.ports.sales.dashboard(organizationId, companyId, query),
  });

  const runtimes = [
    authentication,
    billing,
    inventory,
    operationContext,
    organizations,
    portalMonitoring,
    products,
    profile,
    purchasing,
    sales,
  ] as const;

  return createKontaveClient({
    features: Object.freeze({
      authentication: authentication.feature,
      billing: billing.feature,
      inventory: inventory.feature,
      operationContext: operationContext.feature,
      organizations: organizations.feature,
      portalMonitoring: portalMonitoring.feature,
      products: products.feature,
      profile: profile.feature,
      purchasing: purchasing.feature,
      sales: sales.feature,
    }),
    modules: [
      ...runtimes.map((runtime) => runtime.module),
      ...(options.modules ?? []),
    ],
    ...(options.observeUnexpectedFailure
      ? { observeUnexpectedFailure: options.observeUnexpectedFailure }
      : {}),
  });
}
