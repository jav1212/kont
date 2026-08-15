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
  { id: "inventory.departments", label: "Departamentos", parentId: "inventory" },
  { id: "inventory.department-detail", label: "Departamento", parentId: "inventory.departments" },
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
  { id: "tools.platform-status", label: "Estatus de portales", parentId: "tools" },
  { id: "tools.portal-status-detail", label: "Portal", parentId: "tools.platform-status" },

  { id: "profile", label: "Perfil", parentId: "home" },
  { id: "help", label: "Ayuda", parentId: "home" },
  { id: "settings", label: "Configuración", parentId: "home" },
] as const satisfies readonly NavigationNode[];

export type NavigationDestinationId = typeof NAVIGATION_DESTINATIONS[number]["id"];

export interface NavigationNode<TId extends string = string> {
  readonly id: TId;
  readonly label: string;
  readonly parentId: TId | null;
}

export interface NavigationParametersByDestination {
  readonly "purchases.detail": { readonly purchaseId: string };
  readonly "sales.detail": { readonly saleId: string };
  readonly "inventory.product-detail": { readonly productId: string };
  readonly "inventory.department-detail": { readonly departmentId: string };
  readonly "accounting.journal-entry": { readonly entryId: string };
  readonly "companies.detail": { readonly companyId: string };
  readonly "tools.portal-status-detail": { readonly portalSlug: string };
}

type DynamicNavigationDestinationId = keyof NavigationParametersByDestination;
type StaticNavigationDestinationId = Exclude<NavigationDestinationId, DynamicNavigationDestinationId>;

export type NavigationTarget =
  | { readonly [TId in StaticNavigationDestinationId]: { readonly id: TId } }[StaticNavigationDestinationId]
  | { readonly [TId in DynamicNavigationDestinationId]: {
      readonly id: TId;
      readonly parameters: NavigationParametersByDestination[TId];
    } }[DynamicNavigationDestinationId];

export interface BreadcrumbEntry {
  readonly label: string;
  readonly destination: NavigationTarget;
  readonly current: boolean;
}

export type NavigationFailureCode =
  | "DESTINATION_NOT_FOUND"
  | "DESTINATION_PARAMETERS_INVALID"
  | "CATALOG_DUPLICATE_DESTINATION"
  | "CATALOG_PARENT_NOT_FOUND"
  | "CATALOG_CYCLE";

export class NavigationFailure extends Error {
  constructor(readonly code: NavigationFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NavigationFailure";
  }
}

export type NavigationLabels = Readonly<Partial<Record<NavigationDestinationId, string>>>;

const REQUIRED_PARAMETERS: Readonly<Partial<Record<NavigationDestinationId, readonly string[]>>> = Object.freeze({
  "purchases.detail": ["purchaseId"],
  "sales.detail": ["saleId"],
  "inventory.product-detail": ["productId"],
  "inventory.department-detail": ["departmentId"],
  "accounting.journal-entry": ["entryId"],
  "companies.detail": ["companyId"],
  "tools.portal-status-detail": ["portalSlug"],
});

export class NavigationCatalog<TId extends string = NavigationDestinationId> {
  private readonly nodes: ReadonlyMap<TId, NavigationNode<TId>>;

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

  get(id: TId): NavigationNode<TId> {
    const node = this.nodes.get(id);
    if (!node) throw new NavigationFailure("DESTINATION_NOT_FOUND", `Navigation destination '${id}' does not exist.`);
    return node;
  }

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

export const applicationNavigation = new NavigationCatalog<NavigationDestinationId>(NAVIGATION_DESTINATIONS);

export function staticNavigationTarget<TId extends StaticNavigationDestinationId>(id: TId): Extract<NavigationTarget, { id: TId }> {
  applicationNavigation.get(id);
  return Object.freeze({ id }) as Extract<NavigationTarget, { id: TId }>;
}

export function dynamicNavigationTarget<TId extends DynamicNavigationDestinationId>(
  id: TId,
  parameters: NavigationParametersByDestination[TId],
): Extract<NavigationTarget, { id: TId }> {
  applicationNavigation.get(id);
  validateParameters(id, parameters);
  return Object.freeze({ id, parameters: Object.freeze({ ...parameters }) }) as Extract<NavigationTarget, { id: TId }>;
}

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
