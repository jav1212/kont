/** Canonical portable navigation hierarchy shared by every client presentation. */
export const NAVIGATION_DESTINATIONS = [
  { id: "home", label: "Inicio", parentId: null, webPath: "/" },

  { id: "payroll", label: "Nómina", parentId: "home", webPath: "/payroll/tablero" },
  { id: "payroll.dashboard", label: "Tablero", parentId: "payroll", webPath: "/payroll/tablero" },
  { id: "payroll.employees", label: "Empleados", parentId: "payroll", webPath: "/payroll/employees" },
  { id: "payroll.settings", label: "Configuración", parentId: "payroll", webPath: "/payroll/settings" },
  { id: "payroll.calculator", label: "Calculadora", parentId: "payroll", webPath: "/payroll" },
  { id: "payroll.vacations", label: "Vacaciones", parentId: "payroll", webPath: "/payroll/vacations" },
  { id: "payroll.profit-sharing", label: "Utilidades", parentId: "payroll", webPath: "/payroll/profit-sharing" },
  { id: "payroll.social-benefits", label: "Prestaciones", parentId: "payroll", webPath: "/payroll/social-benefits" },
  { id: "payroll.liquidations", label: "Liquidaciones", parentId: "payroll", webPath: "/payroll/liquidations" },
  { id: "payroll.ari", label: "AR-I (ISLR)", parentId: "payroll", webPath: "/payroll/ari" },
  { id: "payroll.history", label: "Historial", parentId: "payroll", webPath: "/payroll/history" },

  { id: "purchases", label: "Compras", parentId: "home", webPath: "/purchases" },
  { id: "purchases.dashboard", label: "Tablero", parentId: "purchases", webPath: "/purchases" },
  { id: "purchases.suppliers", label: "Proveedores", parentId: "purchases", webPath: "/purchases/suppliers" },
  { id: "purchases.import-book", label: "Importar libro", parentId: "purchases", webPath: "/purchases/import-book" },
  { id: "purchases.archive", label: "Archivo de facturas", parentId: "purchases", webPath: "/purchases/archive" },
  { id: "purchases.iva-ledger", label: "Libro IVA", parentId: "purchases", webPath: "/purchases/iva-ledger" },
  { id: "purchases.detail", label: "Factura", parentId: "purchases.archive", webPath: "/purchases/[purchaseId]" },
  { id: "purchases.supplier-detail", label: "Proveedor", parentId: "purchases.suppliers", webPath: "/purchases/suppliers/[supplierId]" },

  { id: "sales", label: "Ventas", parentId: "home", webPath: "/sales" },
  { id: "sales.dashboard", label: "Tablero", parentId: "sales", webPath: "/sales" },
  { id: "sales.point-of-sale", label: "Punto de venta", parentId: "sales", webPath: "/sales/pos" },
  { id: "sales.customers", label: "Clientes", parentId: "sales", webPath: "/sales/customers" },
  { id: "sales.receivables", label: "Cuentas por cobrar", parentId: "sales", webPath: "/sales/receivables" },
  { id: "sales.fiscal", label: "Documentos fiscales", parentId: "sales", webPath: "/sales/fiscal" },
  { id: "sales.iva-ledger", label: "Libro IVA", parentId: "sales", webPath: "/sales/iva-ledger" },
  { id: "sales.archive", label: "Archivo de facturas", parentId: "sales", webPath: "/sales/archive" },
  { id: "sales.igtf", label: "IGTF Quincenal", parentId: "sales", webPath: "/sales/igtf-fortnightly" },
  { id: "sales.detail", label: "Factura", parentId: "sales.archive", webPath: "/sales/[saleId]" },
  { id: "sales.fiscal-detail", label: "Documento fiscal", parentId: "sales", webPath: "/sales/fiscal/[fiscalId]" },

  { id: "inventory", label: "Inventario", parentId: "home", webPath: "/inventory" },
  { id: "inventory.dashboard", label: "Tablero", parentId: "inventory", webPath: "/inventory" },
  { id: "inventory.products", label: "Productos", parentId: "inventory", webPath: "/inventory/products" },
  { id: "inventory.product-detail", label: "Producto", parentId: "inventory.products", webPath: "/inventory/products/[productId]" },
  { id: "inventory.product-categories", label: "Categorías", parentId: "inventory" },
  { id: "inventory.product-category-detail", label: "Categoría", parentId: "inventory.product-categories" },
  // Compatibility aliases for existing clients while they migrate to the portable product-category terminology.
  { id: "inventory.departments", label: "Departamentos", parentId: "inventory", webPath: "/inventory/departments" },
  { id: "inventory.department-detail", label: "Categoría", parentId: "inventory.departments", webPath: "/inventory/departments/[departmentId]" },
  { id: "inventory.inputs", label: "Entradas", parentId: "inventory", webPath: "/inventory/inputs" },
  { id: "inventory.outputs", label: "Salidas", parentId: "inventory", webPath: "/inventory/sales" },
  { id: "inventory.operations", label: "Operaciones", parentId: "inventory", webPath: "/inventory/operations" },
  { id: "inventory.pending-purchases", label: "Compras pendientes", parentId: "inventory", webPath: "/inventory/compras-pendientes" },
  { id: "inventory.pending-purchase-detail", label: "Compra pendiente", parentId: "inventory.pending-purchases", webPath: "/inventory/compras-pendientes/[purchaseId]" },
  { id: "inventory.purchase-ledger", label: "Libro de Entradas", parentId: "inventory", webPath: "/inventory/purchase-ledger" },
  { id: "inventory.sales-ledger", label: "Libro de Salidas", parentId: "inventory", webPath: "/inventory/sales-ledger" },
  { id: "inventory.inventory-ledger", label: "Libro de Inventarios", parentId: "inventory", webPath: "/inventory/inventory-ledger" },
  { id: "inventory.period-report", label: "Reporte Período", parentId: "inventory", webPath: "/inventory/report" },
  { id: "inventory.balance-report", label: "Reporte SALDO", parentId: "inventory", webPath: "/inventory/balance-report" },
  { id: "inventory.islr-report", label: "Reporte ISLR 177", parentId: "inventory", webPath: "/inventory/islr-report" },

  { id: "treasury", label: "Tesorería", parentId: "home", webPath: "/treasury" },
  { id: "treasury.dashboard", label: "Tablero", parentId: "treasury", webPath: "/treasury" },
  { id: "treasury.movements", label: "Movimientos", parentId: "treasury", webPath: "/treasury/movements" },
  { id: "treasury.checks", label: "Cheques", parentId: "treasury", webPath: "/treasury/checks" },
  { id: "treasury.deposits", label: "Depósitos", parentId: "treasury", webPath: "/treasury/deposits" },
  { id: "treasury.payments", label: "Órdenes y pagos", parentId: "treasury", webPath: "/treasury/payments" },
  { id: "treasury.reconciliation", label: "Conciliación bancaria", parentId: "treasury", webPath: "/treasury/reconciliation" },
  { id: "treasury.accounts", label: "Cajas y cuentas", parentId: "treasury", webPath: "/treasury/accounts" },
  { id: "treasury.account-detail", label: "Cuenta", parentId: "treasury.accounts", webPath: "/treasury/accounts/[accountId]" },
  { id: "treasury.checkbooks", label: "Chequeras", parentId: "treasury", webPath: "/treasury/checkbooks" },
  { id: "treasury.beneficiaries", label: "Beneficiarios", parentId: "treasury", webPath: "/treasury/beneficiaries" },
  { id: "treasury.reports", label: "Reportes", parentId: "treasury", webPath: "/treasury/reports" },
  { id: "treasury.tax-policy", label: "Política tributaria", parentId: "treasury", webPath: "/treasury/tax-policy" },

  { id: "payables", label: "Cuentas por pagar", parentId: "home", webPath: "/payables" },
  { id: "payables.dashboard", label: "Tablero", parentId: "payables", webPath: "/payables" },
  { id: "payables.documents", label: "Documentos", parentId: "payables", webPath: "/payables/documents" },
  { id: "payables.document-detail", label: "Documento", parentId: "payables.documents", webPath: "/payables/documents/[documentId]" },
  { id: "payables.suppliers", label: "Proveedores", parentId: "payables", webPath: "/payables/suppliers" },
  { id: "payables.supplier-detail", label: "Proveedor", parentId: "payables.suppliers", webPath: "/payables/suppliers/[supplierId]" },
  { id: "payables.schedule", label: "Programación", parentId: "payables", webPath: "/payables/schedule" },
  { id: "payables.payments", label: "Pagos", parentId: "payables", webPath: "/payables/payments" },
  { id: "payables.withholdings", label: "Retenciones", parentId: "payables", webPath: "/payables/withholdings" },
  { id: "payables.reconciliation", label: "Conciliación contable", parentId: "payables", webPath: "/payables/reconciliation" },

  { id: "iva", label: "IVA", parentId: "home", webPath: "/fiscal" },
  { id: "iva.dashboard", label: "Tablero", parentId: "iva", webPath: "/fiscal" },
  { id: "iva.purchase-ledger", label: "Libro de compras", parentId: "iva", webPath: "/fiscal/compras" },
  { id: "iva.sales-ledger", label: "Libro de ventas", parentId: "iva", webPath: "/fiscal/ventas" },
  { id: "iva.purchase-matches", label: "Pendientes", parentId: "iva", webPath: "/fiscal/pendientes" },
  { id: "iva.imports", label: "Importaciones", parentId: "iva", webPath: "/fiscal/importaciones" },
  { id: "iva.declarations", label: "Declaraciones", parentId: "iva", webPath: "/fiscal/declaraciones" },
  { id: "iva.declaration-detail", label: "Declaración", parentId: "iva.declarations", webPath: "/fiscal/declaraciones/[periodo]" },
  { id: "iva.configuration", label: "Configuración", parentId: "iva", webPath: "/fiscal/configuracion" },
  { id: "iva.withholdings", label: "Retenciones de IVA", parentId: "iva", webPath: "/fiscal/retenciones-iva" },

  { id: "accounting", label: "Contabilidad", parentId: "home", webPath: "/accounting" },
  { id: "accounting.dashboard", label: "Inicio", parentId: "accounting", webPath: "/accounting" },
  { id: "accounting.charts", label: "Planes de cuentas", parentId: "accounting", webPath: "/accounting/charts" },
  { id: "accounting.accounts", label: "Cuentas", parentId: "accounting", webPath: "/accounting/accounts" },
  { id: "accounting.account-detail", label: "Cuenta", parentId: "accounting.accounts", webPath: "/accounting/accounts/[accountId]" },
  { id: "accounting.chart-detail", label: "Plan de cuentas", parentId: "accounting.charts", webPath: "/accounting/charts/[chartId]" },
  { id: "accounting.periods", label: "Períodos", parentId: "accounting", webPath: "/accounting/periods" },
  { id: "accounting.integrations", label: "Integraciones", parentId: "accounting", webPath: "/accounting/integrations" },
  { id: "accounting.journal", label: "Libro diario", parentId: "accounting", webPath: "/accounting/journal" },
  { id: "accounting.journal-entry", label: "Asiento", parentId: "accounting.journal", webPath: "/accounting/journal/[entryId]" },
  { id: "accounting.trial-balance", label: "Balance de sumas", parentId: "accounting", webPath: "/accounting/trial-balance" },
  { id: "accounting.financial-statements", label: "Estados financieros", parentId: "accounting", webPath: "/accounting/financial-statements" },

  { id: "documents", label: "Documentos", parentId: "home", webPath: "/documents" },
  { id: "documents.dashboard", label: "Tablero", parentId: "documents", webPath: "/documents" },
  { id: "documents.files", label: "Archivos", parentId: "documents", webPath: "/documents/files" },
  { id: "documents.contracts", label: "Contratos", parentId: "documents", webPath: "/documents/contracts" },

  { id: "companies", label: "Empresas", parentId: "home", webPath: "/companies" },
  { id: "companies.detail", label: "Empresa", parentId: "companies", webPath: "/companies/[companyId]" },

  { id: "tools", label: "Herramientas", parentId: "home", webPath: "/tools" },
  { id: "tools.dashboard", label: "Tablero", parentId: "tools", webPath: "/tools" },
  { id: "tools.exchange-rates", label: "Divisas BCV", parentId: "tools", webPath: "/tools/divisas" },
  { id: "tools.seniat-calendar", label: "Calendario SENIAT", parentId: "tools", webPath: "/tools/calendario-seniat" },
  { id: "tools.portal-monitoring", label: "Estatus Portales", parentId: "tools", webPath: "/tools/status" },
  { id: "tools.portal-status-detail", label: "Portal", parentId: "tools.portal-monitoring", webPath: "/tools/status/[portalSlug]" },

  { id: "profile", label: "Perfil", parentId: "home" },
  { id: "help", label: "Ayuda", parentId: "home" },
  { id: "settings", label: "Configuración", parentId: "home", webPath: "/settings/organization" },
  { id: "settings.profile", label: "Mi perfil", parentId: "settings", webPath: "/profile" },
  { id: "settings.appearance", label: "Apariencia", parentId: "settings", webPath: "/settings/apariencia" },
  { id: "settings.security", label: "Seguridad", parentId: "settings", webPath: "/settings/security" },
  { id: "settings.organization", label: "Configuración general", parentId: "settings", webPath: "/settings/organization" },
  { id: "settings.members", label: "Miembros", parentId: "settings", webPath: "/settings/members" },
  { id: "settings.roles", label: "Roles", parentId: "settings", webPath: "/settings/roles" },
  { id: "settings.billing", label: "Facturación", parentId: "settings", webPath: "/settings/billing" },
  { id: "settings.devices", label: "Dispositivos", parentId: "settings", webPath: "/settings/devices" },
  { id: "settings.iva", label: "Configuración IVA", parentId: "settings", webPath: "/settings/iva" },
  { id: "settings.security-sales", label: "Control comercial", parentId: "settings", webPath: "/settings/security-sales" },
  { id: "settings.audit", label: "Auditoría", parentId: "settings", webPath: "/settings/audit" },
  { id: "settings.payment-orders", label: "Órdenes de pago", parentId: "settings", webPath: "/settings/payment-orders" },
  { id: "settings.access", label: "Acceso", parentId: "settings", webPath: "/settings/access" },
  { id: "settings.referrals", label: "Referidos", parentId: "settings", webPath: "/settings/referrals" },
  { id: "settings.company", label: "Datos de empresa", parentId: "settings", webPath: "/settings/company" },
  { id: "settings.inventory-config", label: "Inventario", parentId: "settings", webPath: "/settings/inventory-config" },
  { id: "settings.install-app", label: "Instalar app", parentId: "settings", webPath: "/settings/instalar-app" },
  { id: "organization.invitation.accept", label: "Aceptar invitación", parentId: "home" },
] as const satisfies readonly NavigationNode[];

/** Stable identifier of a destination in the application navigation catalog. */
export type NavigationDestinationId = typeof NAVIGATION_DESTINATIONS[number]["id"];

/** Immutable navigation hierarchy node independent of platform routes. */
export interface NavigationNode<TId extends string = string> {
  /** Stable destination identifier. */
  readonly id: TId;
  /** Default user-visible label. */
  readonly label: string;
  /** Parent identifier, or `null` for the root destination. */
  readonly parentId: TId | null;
  /** Optional canonical Web path used only by Web route resolution. */
  readonly webPath?: string;
}

/** Required dynamic parameters keyed by their destination identifier. */
export interface NavigationParametersByDestination {
  readonly "purchases.detail": { readonly purchaseId: string };
  readonly "purchases.supplier-detail": { readonly supplierId: string };
  readonly "sales.detail": { readonly saleId: string };
  readonly "sales.fiscal-detail": { readonly fiscalId: string };
  readonly "inventory.product-detail": { readonly productId: string };
  readonly "inventory.pending-purchase-detail": { readonly purchaseId: string };
  readonly "inventory.product-category-detail": { readonly categoryId: string };
  readonly "inventory.department-detail": { readonly departmentId: string };
  readonly "accounting.journal-entry": { readonly entryId: string };
  readonly "accounting.account-detail": { readonly accountId: string };
  readonly "accounting.chart-detail": { readonly chartId: string };
  readonly "companies.detail": { readonly companyId: string };
  readonly "treasury.account-detail": { readonly accountId: string };
  readonly "payables.supplier-detail": { readonly supplierId: string };
  readonly "payables.document-detail": { readonly documentId: string };
  readonly "iva.declaration-detail": { readonly periodo: string };
  readonly "tools.portal-status-detail": { readonly portalSlug: string };
  readonly "organization.invitation.accept": { readonly token: string };
}

type DynamicNavigationDestinationId = keyof NavigationParametersByDestination;
type StaticNavigationDestinationId = Exclude<NavigationDestinationId, DynamicNavigationDestinationId>;

/** Type-safe navigation intent with parameters required only by dynamic destinations. */
export type NavigationTarget =
  | { readonly [TId in StaticNavigationDestinationId]: { readonly id: TId } }[StaticNavigationDestinationId]
  | { readonly [TId in DynamicNavigationDestinationId]: {
      readonly id: TId;
      readonly parameters: NavigationParametersByDestination[TId];
    } }[DynamicNavigationDestinationId];

/** Portable breadcrumb entry resolved from a navigation target. */
export interface BreadcrumbEntry {
  /** User-visible label after applying an optional override. */
  readonly label: string;
  /** Navigation target represented by the breadcrumb. */
  readonly destination: NavigationTarget;
  /** Whether this entry represents the requested destination. */
  readonly current: boolean;
}

/** Stable classifications for expected navigation failures. */
export type NavigationFailureCode =
  | "DESTINATION_NOT_FOUND"
  | "DESTINATION_PARAMETERS_INVALID"
  | "CATALOG_DUPLICATE_DESTINATION"
  | "CATALOG_PARENT_NOT_FOUND"
  | "CATALOG_CYCLE"
  | "NAVIGATION_LABELS_INVALID"
  | "NAVIGATION_ICONS_INVALID";

/** Expected failure produced by navigation validation or resolution. */
export class NavigationFailure extends Error {
  /**
   * Creates a typed navigation failure.
   * @param code - Stable machine-readable failure classification.
   * @param message - Diagnostic description safe for logs.
   * @param options - Standard error options, including an optional cause.
   */
  constructor(readonly code: NavigationFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NavigationFailure";
  }
}

/** Optional user-visible label overrides keyed by destination. */
export type NavigationLabels = Readonly<Partial<Record<NavigationDestinationId, string>>>;

/** Portable icon meanings that clients map to their native icon libraries. */
export const NAVIGATION_ICON_KEYS = [
  "activity", "archive", "arrow-down", "arrow-up", "book", "briefcase", "building", "calendar",
  "chart", "check", "clipboard", "clock", "coins", "credit-card", "document", "dollar", "download",
  "file", "folder", "grid", "help", "home", "inventory", "key", "list", "lock", "mail", "package",
  "people", "percent", "printer", "receipt", "search", "settings", "shield", "shopping-cart", "tag",
  "tool", "truck", "user", "wallet",
] as const;

/** Stable semantic icon identifier supported by the portable navigation contract. */
export type NavigationIconKey = typeof NAVIGATION_ICON_KEYS[number];

/** Sparse icon overrides keyed by stable navigation destination identifiers. */
export type NavigationIcons = Readonly<Partial<Record<NavigationDestinationId, NavigationIconKey>>>;

/**
 * Validates custom labels against the canonical destination catalog.
 * @param input - Untrusted label map loaded from a client or persistent store.
 * @returns Immutable sparse overrides with trimmed values.
 * @throws {NavigationFailure} When a destination is unknown or a label is invalid.
 */
export function createNavigationLabels(input: Readonly<Record<string, unknown>>): NavigationLabels {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidLabels();
  const catalogIds = new Set<string>(NAVIGATION_DESTINATIONS.map((destination) => destination.id));
  const entries = Object.entries(input);
  if (entries.length > 100) throw invalidLabels();
  const labels: Partial<Record<NavigationDestinationId, string>> = {};
  for (const [id, value] of entries) {
    if (!catalogIds.has(id) || typeof value !== "string") throw invalidLabels();
    if (/[\u0000-\u001f\u007f]/.test(value)) throw invalidLabels();
    const normalized = value.trim();
    if (!normalized || normalized.length > 60) throw invalidLabels();
    labels[id as NavigationDestinationId] = normalized;
  }
  return Object.freeze(labels);
}

/**
 * Validates portable icon overrides without accepting platform-specific library names.
 * @param input - Untrusted destination-to-icon mapping.
 * @returns Frozen sparse icon overrides with stable destination and semantic icon keys.
 * @throws {NavigationFailure} When a destination or icon key is outside its canonical catalog.
 */
export function createNavigationIcons(input: Readonly<Record<string, unknown>>): NavigationIcons {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidIcons();
  const destinations = new Set<string>(NAVIGATION_DESTINATIONS.map((destination) => destination.id));
  const iconKeys = new Set<string>(NAVIGATION_ICON_KEYS);
  const entries = Object.entries(input);
  if (entries.length > 100) throw invalidIcons();
  const icons: Partial<Record<NavigationDestinationId, NavigationIconKey>> = {};
  for (const [destinationId, iconKey] of entries) {
    if (!destinations.has(destinationId) || typeof iconKey !== "string" || !iconKeys.has(iconKey)) throw invalidIcons();
    icons[destinationId as NavigationDestinationId] = iconKey as NavigationIconKey;
  }
  return Object.freeze(icons);
}

const REQUIRED_PARAMETERS: Readonly<Partial<Record<NavigationDestinationId, readonly string[]>>> = Object.freeze({
  "purchases.detail": ["purchaseId"],
  "purchases.supplier-detail": ["supplierId"],
  "sales.detail": ["saleId"],
  "sales.fiscal-detail": ["fiscalId"],
  "inventory.product-detail": ["productId"],
  "inventory.pending-purchase-detail": ["purchaseId"],
  "inventory.product-category-detail": ["categoryId"],
  "inventory.department-detail": ["departmentId"],
  "accounting.journal-entry": ["entryId"],
  "accounting.account-detail": ["accountId"],
  "accounting.chart-detail": ["chartId"],
  "companies.detail": ["companyId"],
  "treasury.account-detail": ["accountId"],
  "payables.supplier-detail": ["supplierId"],
  "payables.document-detail": ["documentId"],
  "iva.declaration-detail": ["periodo"],
  "tools.portal-status-detail": ["portalSlug"],
  "organization.invitation.accept": ["token"],
});

/** Validated immutable navigation hierarchy indexed by destination identifier. */
export class NavigationCatalog<TId extends string = NavigationDestinationId> {
  private readonly nodes: ReadonlyMap<TId, NavigationNode<TId>>;

  /**
   * Creates and validates a navigation catalog.
   * @param nodes - Complete set of hierarchy nodes to index.
   * @throws {NavigationFailure} When identifiers are duplicated, a parent is missing, or a cycle exists.
   */
  constructor(nodes: readonly NavigationNode<TId>[]) {
    const indexed = new Map<TId, NavigationNode<TId>>();
    for (const node of nodes) {
      if (indexed.has(node.id)) {
        throw new NavigationFailure("CATALOG_DUPLICATE_DESTINATION", `Navigation destination '${node.id}' is duplicated.`);
      }
      indexed.set(node.id, Object.freeze({ ...node }));
    }
    for (const node of indexed.values()) {
      if (node.parentId !== null && !indexed.has(node.parentId)) {
        throw new NavigationFailure("CATALOG_PARENT_NOT_FOUND", `Parent '${node.parentId}' does not exist.`);
      }
      this.assertAcyclic(node.id, indexed);
    }
    this.nodes = indexed;
  }

  /**
   * Resolves a destination node by identifier.
   * @param id - Destination identifier to resolve.
   * @returns The immutable indexed navigation node.
   * @throws {NavigationFailure} When the destination does not exist.
   */
  get(id: TId): NavigationNode<TId> {
    const node = this.nodes.get(id);
    if (!node) throw new NavigationFailure("DESTINATION_NOT_FOUND", `Navigation destination '${id}' does not exist.`);
    return node;
  }

  /**
   * Resolves the hierarchy from the root through the requested destination.
   * @param id - Destination identifier whose hierarchy is required.
   * @returns Immutable nodes ordered from root to destination.
   * @throws {NavigationFailure} When the destination does not exist.
   */
  ancestors(id: TId): readonly NavigationNode<TId>[] {
    const result: NavigationNode<TId>[] = [];
    let node: NavigationNode<TId> | undefined = this.get(id);
    while (node) {
      result.unshift(node);
      node = node.parentId === null ? undefined : this.get(node.parentId);
    }
    return Object.freeze(result);
  }

  private assertAcyclic(id: TId, nodes: ReadonlyMap<TId, NavigationNode<TId>>): void {
    const visited = new Set<TId>();
    let current: TId | null = id;
    while (current !== null) {
      if (visited.has(current)) throw new NavigationFailure("CATALOG_CYCLE", `Navigation destination '${id}' has a cyclic hierarchy.`);
      visited.add(current);
      current = nodes.get(current)?.parentId ?? null;
    }
  }
}

/** Validated canonical navigation catalog used by application clients. */
export const applicationNavigation = new NavigationCatalog<NavigationDestinationId>(NAVIGATION_DESTINATIONS);

/**
 * Creates a validated target for a destination without dynamic parameters.
 * @param id - Static destination identifier.
 * @returns An immutable type-safe navigation target.
 * @throws {NavigationFailure} When the destination is not present in the catalog.
 */
export function staticNavigationTarget<TId extends StaticNavigationDestinationId>(id: TId): Extract<NavigationTarget, { id: TId }> {
  applicationNavigation.get(id);
  return Object.freeze({ id }) as Extract<NavigationTarget, { id: TId }>;
}

/**
 * Creates a validated target for a destination requiring dynamic parameters.
 * @param id - Dynamic destination identifier.
 * @param parameters - Parameters required by that destination.
 * @returns An immutable type-safe navigation target.
 * @throws {NavigationFailure} When the destination is missing or its parameters are invalid.
 */
export function dynamicNavigationTarget<TId extends DynamicNavigationDestinationId>(
  id: TId,
  parameters: NavigationParametersByDestination[TId],
): Extract<NavigationTarget, { id: TId }> {
  applicationNavigation.get(id);
  validateParameters(id, parameters);
  return Object.freeze({ id, parameters: Object.freeze({ ...parameters }) }) as Extract<NavigationTarget, { id: TId }>;
}

/**
 * Resolves portable breadcrumbs for a navigation target.
 * @param target - Validated destination target to represent.
 * @param labels - Optional destination label overrides.
 * @returns Immutable breadcrumb entries ordered from root to target.
 * @throws {NavigationFailure} When the target is unknown or any supplied label override is invalid.
 */
export function resolveBreadcrumbs(target: NavigationTarget, labels: NavigationLabels = {}): readonly BreadcrumbEntry[] {
  const safeLabels = createNavigationLabels(labels);
  const hierarchy = applicationNavigation.ancestors(target.id);
  return Object.freeze(hierarchy.map((node, index) => {
    const current = index === hierarchy.length - 1;
    const destination = current
      ? target
      : staticNavigationTarget(node.id as StaticNavigationDestinationId);
    return Object.freeze({
      label: safeLabels[node.id] ?? node.label,
      destination,
      current,
    });
  }));
}

/**
 * Resolves the most specific catalog destination for a Web pathname.
 * @param pathname - Browser pathname, optionally containing dynamic route segments.
 * @returns A typed navigation target, including extracted dynamic parameters, or undefined when unmatched.
 */
export function resolveNavigationTargetFromPath(pathname: string): NavigationTarget | undefined {
  const path = pathname.split(/[?#]/, 1)[0]?.replace(/\/+$/, "") || "/";
  const candidates = NAVIGATION_DESTINATIONS
    .flatMap((node) => "webPath" in node ? [{ node, parts: node.webPath.split("/").filter(Boolean) }] : [])
    .sort((left, right) => right.parts.length - left.parts.length
      || right.node.id.split(".").length - left.node.id.split(".").length);
  const actual = path.split("/").filter(Boolean);
  for (const candidate of candidates) {
    if (actual.length !== candidate.parts.length) continue;
    const parameters: Record<string, string> = {};
    let matches = true;
    for (let index = 0; index < candidate.parts.length; index += 1) {
      const expected = candidate.parts[index];
      const value = actual[index];
      if (expected === undefined || value === undefined) { matches = false; break; }
      if (expected.startsWith(":") || expected.startsWith("[")) {
        try {
          const name = expected.replace(/^:|\[|\]/g, "");
          const destinationId = candidate.node.id as NavigationDestinationId;
          const parameterName = REQUIRED_PARAMETERS[destinationId]?.[0] ?? name;
          parameters[parameterName] = decodeURIComponent(value);
        }
        catch { matches = false; break; }
      }
      else if (expected !== value) { matches = false; break; }
    }
    if (!matches) continue;
    const id = candidate.node.id as NavigationDestinationId;
    if (id in REQUIRED_PARAMETERS) {
      const key = REQUIRED_PARAMETERS[id]?.[0];
      if (!key || !parameters[key]) continue;
      return dynamicNavigationTarget(id as DynamicNavigationDestinationId, parameters as never);
    }
    return staticNavigationTarget(id as StaticNavigationDestinationId);
  }
  return undefined;
}

function validateParameters<TId extends DynamicNavigationDestinationId>(
  id: TId,
  parameters: NavigationParametersByDestination[TId],
): void {
  const candidate: unknown = parameters;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw invalidParameters(id);
  const record = candidate as Readonly<Record<string, unknown>>;
  for (const key of REQUIRED_PARAMETERS[id] ?? []) {
    if (typeof record[key] !== "string" || !record[key].trim()) throw invalidParameters(id);
  }
}

function invalidLabels(): NavigationFailure {
  return new NavigationFailure("NAVIGATION_LABELS_INVALID", "Navigation label overrides are invalid.");
}

function invalidIcons(): NavigationFailure {
  return new NavigationFailure("NAVIGATION_ICONS_INVALID", "Navigation icon overrides are invalid.");
}

function invalidParameters(id: NavigationDestinationId): NavigationFailure {
  return new NavigationFailure("DESTINATION_PARAMETERS_INVALID", `Navigation destination '${id}' has invalid parameters.`);
}
