/** Canonical portable navigation hierarchy shared by every client presentation. */
export const NAVIGATION_DESTINATIONS = [
  { id: "home", label: "Inicio", parentId: null },

  { id: "payroll", label: "Nómina", parentId: "home" },
  { id: "payroll.dashboard", label: "Tablero", parentId: "payroll" },
  { id: "payroll.employees", label: "Empleados", parentId: "payroll" },
  { id: "payroll.settings", label: "Configuración", parentId: "payroll" },
  { id: "payroll.calculator", label: "Calculadora", parentId: "payroll" },
  { id: "payroll.vacations", label: "Vacaciones", parentId: "payroll" },
  { id: "payroll.profit-sharing", label: "Utilidades", parentId: "payroll" },
  { id: "payroll.social-benefits", label: "Prestaciones", parentId: "payroll" },
  { id: "payroll.liquidations", label: "Liquidaciones", parentId: "payroll" },
  { id: "payroll.ari", label: "AR-I (ISLR)", parentId: "payroll" },
  { id: "payroll.history", label: "Historial", parentId: "payroll" },

  { id: "purchases", label: "Compras", parentId: "home" },
  { id: "purchases.dashboard", label: "Tablero", parentId: "purchases" },
  { id: "purchases.suppliers", label: "Proveedores", parentId: "purchases" },
  { id: "purchases.import-book", label: "Importar libro", parentId: "purchases" },
  { id: "purchases.archive", label: "Archivo de facturas", parentId: "purchases" },
  { id: "purchases.detail", label: "Factura", parentId: "purchases" },

  { id: "sales", label: "Ventas", parentId: "home" },
  { id: "sales.dashboard", label: "Tablero", parentId: "sales" },
  { id: "sales.point-of-sale", label: "Punto de venta", parentId: "sales" },
  { id: "sales.customers", label: "Clientes", parentId: "sales" },
  { id: "sales.archive", label: "Archivo de facturas", parentId: "sales" },
  { id: "sales.igtf", label: "IGTF Quincenal", parentId: "sales" },
  { id: "sales.detail", label: "Factura", parentId: "sales" },

  { id: "inventory", label: "Inventario", parentId: "home" },
  { id: "inventory.dashboard", label: "Tablero", parentId: "inventory" },
  { id: "inventory.products", label: "Productos", parentId: "inventory" },
  { id: "inventory.product-detail", label: "Producto", parentId: "inventory.products" },
  { id: "inventory.product-categories", label: "Categorías", parentId: "inventory" },
  { id: "inventory.product-category-detail", label: "Categoría", parentId: "inventory.product-categories" },
  // Compatibility aliases for existing clients while they migrate to the portable product-category terminology.
  { id: "inventory.departments", label: "Categorías", parentId: "inventory" },
  { id: "inventory.department-detail", label: "Categoría", parentId: "inventory.departments" },
  { id: "inventory.inputs", label: "Entradas", parentId: "inventory" },
  { id: "inventory.outputs", label: "Salidas", parentId: "inventory" },
  { id: "inventory.operations", label: "Operaciones", parentId: "inventory" },
  { id: "inventory.pending-purchases", label: "Compras pendientes", parentId: "inventory" },
  { id: "inventory.purchase-ledger", label: "Libro de Entradas", parentId: "inventory" },
  { id: "inventory.sales-ledger", label: "Libro de Salidas", parentId: "inventory" },
  { id: "inventory.inventory-ledger", label: "Libro de Inventarios", parentId: "inventory" },
  { id: "inventory.period-report", label: "Reporte Período", parentId: "inventory" },
  { id: "inventory.balance-report", label: "Reporte SALDO", parentId: "inventory" },
  { id: "inventory.islr-report", label: "Reporte ISLR 177", parentId: "inventory" },

  { id: "accounting", label: "Contabilidad", parentId: "home" },
  { id: "accounting.dashboard", label: "Inicio", parentId: "accounting" },
  { id: "accounting.charts", label: "Planes de cuentas", parentId: "accounting" },
  { id: "accounting.accounts", label: "Cuentas", parentId: "accounting" },
  { id: "accounting.periods", label: "Períodos", parentId: "accounting" },
  { id: "accounting.integrations", label: "Integraciones", parentId: "accounting" },
  { id: "accounting.journal", label: "Libro diario", parentId: "accounting" },
  { id: "accounting.journal-entry", label: "Asiento", parentId: "accounting.journal" },
  { id: "accounting.trial-balance", label: "Balance de sumas", parentId: "accounting" },
  { id: "accounting.financial-statements", label: "Estados financieros", parentId: "accounting" },

  { id: "documents", label: "Documentos", parentId: "home" },
  { id: "documents.dashboard", label: "Tablero", parentId: "documents" },
  { id: "documents.files", label: "Archivos", parentId: "documents" },
  { id: "documents.contracts", label: "Contratos", parentId: "documents" },

  { id: "companies", label: "Empresas", parentId: "home" },
  { id: "companies.detail", label: "Empresa", parentId: "companies" },

  { id: "tools", label: "Herramientas", parentId: "home" },
  { id: "tools.dashboard", label: "Tablero", parentId: "tools" },
  { id: "tools.exchange-rates", label: "Divisas BCV", parentId: "tools" },
  { id: "tools.seniat-calendar", label: "Calendario SENIAT", parentId: "tools" },
  { id: "tools.portal-monitoring", label: "Estatus de portales", parentId: "tools" },
  { id: "tools.portal-status-detail", label: "Portal", parentId: "tools.portal-monitoring" },

  { id: "profile", label: "Perfil", parentId: "home" },
  { id: "help", label: "Ayuda", parentId: "home" },
  { id: "settings", label: "Configuración", parentId: "home" },
  { id: "settings.profile", label: "Perfil", parentId: "settings" },
  { id: "settings.appearance", label: "Apariencia", parentId: "settings" },
  { id: "settings.security", label: "Seguridad", parentId: "settings" },
  { id: "settings.organization", label: "Organización", parentId: "settings" },
  { id: "settings.members", label: "Miembros", parentId: "settings" },
  { id: "settings.roles", label: "Roles y permisos", parentId: "settings" },
  { id: "settings.billing", label: "Facturación", parentId: "settings" },
  { id: "settings.devices", label: "Dispositivos", parentId: "settings" },
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
}

/** Required dynamic parameters keyed by their destination identifier. */
export interface NavigationParametersByDestination {
  readonly "purchases.detail": { readonly purchaseId: string };
  readonly "sales.detail": { readonly saleId: string };
  readonly "inventory.product-detail": { readonly productId: string };
  readonly "inventory.product-category-detail": { readonly categoryId: string };
  readonly "inventory.department-detail": { readonly departmentId: string };
  readonly "accounting.journal-entry": { readonly entryId: string };
  readonly "companies.detail": { readonly companyId: string };
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
  | "CATALOG_CYCLE";

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

const REQUIRED_PARAMETERS: Readonly<Partial<Record<NavigationDestinationId, readonly string[]>>> = Object.freeze({
  "purchases.detail": ["purchaseId"],
  "sales.detail": ["saleId"],
  "inventory.product-detail": ["productId"],
  "inventory.product-category-detail": ["categoryId"],
  "inventory.department-detail": ["departmentId"],
  "accounting.journal-entry": ["entryId"],
  "companies.detail": ["companyId"],
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
 * @throws {NavigationFailure} When the target is unknown or a resolved label is empty.
 */
export function resolveBreadcrumbs(target: NavigationTarget, labels: NavigationLabels = {}): readonly BreadcrumbEntry[] {
  const hierarchy = applicationNavigation.ancestors(target.id);
  return Object.freeze(hierarchy.map((node, index) => {
    const current = index === hierarchy.length - 1;
    const destination = current
      ? target
      : staticNavigationTarget(node.id as StaticNavigationDestinationId);
    return Object.freeze({
      label: normalizeLabel(labels[node.id] ?? node.label),
      destination,
      current,
    });
  }));
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

function normalizeLabel(value: string): string {
  const label = value.trim();
  if (!label) throw new NavigationFailure("DESTINATION_PARAMETERS_INVALID", "Breadcrumb labels cannot be empty.");
  return label;
}

function invalidParameters(id: NavigationDestinationId): NavigationFailure {
  return new NavigationFailure("DESTINATION_PARAMETERS_INVALID", `Navigation destination '${id}' has invalid parameters.`);
}
