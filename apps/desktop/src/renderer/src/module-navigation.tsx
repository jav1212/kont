import {
  Activity,
  Archive,
  ArrowRightLeft,
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  Calculator,
  CalendarDays,
  DollarSign,
  FileText,
  Files,
  Gauge,
  HandCoins,
  History,
  Landmark,
  Package,
  PenLine,
  Settings,
  ShoppingCart,
  Truck,
  Upload,
  UserMinus,
  Users,
  WalletCards,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import type { PermissionCode } from "@kontave/access-control/domain";
import { canReadSalesDashboard, resolveSalesLanding } from "@kontave/sales/application";
import {
  applicationNavigation,
  resolveBreadcrumbs,
  staticNavigationTarget,
  type BreadcrumbEntry,
  type NavigationDestinationId,
  type NavigationParametersByDestination,
  type NavigationTarget,
} from "@kontave/navigation";
import type { WorkspaceSidebarSection } from "./presentation/workspace-sidebar";

type DynamicDestinationId = keyof NavigationParametersByDestination;
type StaticDestinationId = Exclude<
  NavigationDestinationId,
  DynamicDestinationId
>;

interface NavigationItemPresentation {
  readonly id: StaticDestinationId;
  readonly icon: ReactNode;
  readonly group?: string;
  readonly beta?: boolean;
}

/** Desktop support matrix. Business labels and hierarchy remain catalog-owned. */
const DESKTOP_DESTINATIONS: Readonly<
  Record<string, readonly NavigationItemPresentation[]>
> = {
  payroll: [
    { id: "payroll.dashboard", icon: <Gauge /> },
    { id: "payroll.employees", icon: <Users /> },
    { id: "payroll.settings", icon: <Settings /> },
    { id: "payroll.calculator", icon: <Calculator />, group: "Operaciones" },
    {
      id: "payroll.vacations",
      icon: <CalendarDays />,
      group: "Operaciones",
      beta: true,
    },
    {
      id: "payroll.profit-sharing",
      icon: <HandCoins />,
      group: "Operaciones",
      beta: true,
    },
    {
      id: "payroll.social-benefits",
      icon: <Landmark />,
      group: "Operaciones",
      beta: true,
    },
    {
      id: "payroll.liquidations",
      icon: <UserMinus />,
      group: "Operaciones",
      beta: true,
    },
    { id: "payroll.ari", icon: <FileText />, group: "Operaciones", beta: true },
    { id: "payroll.history", icon: <History />, group: "Histórico" },
  ],
  purchases: [
    { id: "purchases.dashboard", icon: <Gauge /> },
    { id: "purchases.suppliers", icon: <Truck />, group: "Catálogos" },
    { id: "purchases.import-book", icon: <Upload />, group: "Operaciones" },
    { id: "purchases.archive", icon: <Archive />, group: "Operaciones" },
  ],
  sales: [
    { id: "sales.dashboard", icon: <Gauge /> },
    { id: "sales.point-of-sale", icon: <ShoppingCart />, group: "Operaciones" },
    { id: "sales.customers", icon: <Users />, group: "Catálogos" },
    { id: "sales.archive", icon: <Archive />, group: "Operaciones" },
    { id: "sales.igtf", icon: <FileText />, group: "Reportes" },
  ],
  inventory: [
    { id: "inventory.dashboard", icon: <Gauge /> },
    { id: "inventory.products", icon: <Package />, group: "Catálogos" },
    {
      id: "inventory.product-categories",
      icon: <Building2 />,
      group: "Catálogos",
    },
    { id: "inventory.inputs", icon: <ArrowRightLeft />, group: "Operaciones" },
    { id: "inventory.outputs", icon: <Boxes />, group: "Operaciones" },
    {
      id: "inventory.operations",
      icon: <ArrowRightLeft />,
      group: "Operaciones",
    },
    { id: "inventory.purchase-ledger", icon: <BookOpen />, group: "Reportes" },
    { id: "inventory.sales-ledger", icon: <BookOpen />, group: "Reportes" },
    { id: "inventory.period-report", icon: <BarChart3 />, group: "Reportes" },
  ],
  accounting: [
    { id: "accounting.dashboard", icon: <Gauge /> },
    { id: "accounting.charts", icon: <BookOpen />, group: "Configuración" },
    {
      id: "accounting.accounts",
      icon: <WalletCards />,
      group: "Configuración",
    },
    {
      id: "accounting.periods",
      icon: <CalendarDays />,
      group: "Configuración",
    },
    { id: "accounting.journal", icon: <PenLine />, group: "Contabilidad" },
    {
      id: "accounting.trial-balance",
      icon: <BarChart3 />,
      group: "Contabilidad",
    },
    {
      id: "accounting.financial-statements",
      icon: <FileText />,
      group: "Reportes",
    },
  ],
  tools: [
    { id: "tools.dashboard", icon: <Wrench /> },
    { id: "tools.exchange-rates", icon: <DollarSign />, group: "Conversores" },
    {
      id: "tools.seniat-calendar",
      icon: <CalendarDays />,
      group: "Calendarios",
    },
    { id: "tools.portal-monitoring", icon: <Activity />, group: "Monitoreo" },
  ],
  companies: [{ id: "companies", icon: <Building2 /> }],
  documents: [
    { id: "documents.dashboard", icon: <Gauge /> },
    { id: "documents.files", icon: <Files /> },
    { id: "documents.contracts", icon: <FileText />, group: "Generador" },
  ],
};

const supportedDestinations = new Set<StaticDestinationId>([
  ...Object.values(DESKTOP_DESTINATIONS).flatMap((items) =>
    items.map(({ id }) => id),
  ),
  "settings",
  "settings.profile",
  "settings.appearance",
  "settings.security",
  "settings.organization",
  "settings.members",
  "settings.roles",
  "settings.billing",
  "settings.devices",
]);

/**
 * Builds the sidebar sections for a module using server-resolved workspace grants.
 * @param moduleId - Active business module, or null before workspace selection.
 * @param activeTarget - Current destination used to mark the selected item.
 * @param permissions - Effective permission grants for the active organization.
 * @returns Visible navigation sections with the sales dashboard filtered by policy.
 */
export function moduleNavigationSections(
  moduleId: string | null,
  activeTarget: NavigationTarget | null,
  permissions: readonly PermissionCode[] = [],
): readonly WorkspaceSidebarSection[] {
  const items = moduleId
    ? (DESKTOP_DESTINATIONS[moduleId] ?? []).filter(
        (item) => item.id !== "sales.dashboard" || canReadSalesDashboard(permissions),
      )
    : [];
  const groups = new Map<string, NavigationItemPresentation[]>();
  for (const item of items) {
    const group = item.group ?? "";
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return [...groups.entries()].map(([group, entries], index) => ({
    id: `${moduleId ?? "module"}-${group || "root"}`,
    ...(group ? { label: group } : {}),
    items: entries.map((item) => ({
      id: item.id,
      label: applicationNavigation.get(item.id).label,
      icon: item.icon,
      active: item.id === activeTarget?.id,
      ...(item.beta ? { badge: "BETA" } : {}),
      ...(index > 0 && item === entries[0] ? { startsGroup: true } : {}),
    })),
  }));
}

/**
 * Selects the module's initial destination from the shared sales access policy.
 * @param moduleId - Active business module, or null before workspace selection.
 * @param permissions - Effective permission grants for the active organization.
 * @returns An allowed static destination, or null when none is available.
 */
export function defaultModuleNavigationTarget(
  moduleId: string | null,
  permissions: readonly PermissionCode[] = [],
): NavigationTarget | null {
  const destinations = moduleId ? (DESKTOP_DESTINATIONS[moduleId] ?? []) : [];
  const salesDestination = {
    dashboard: "sales.dashboard",
    "point-of-sale": "sales.point-of-sale",
    archive: "sales.archive",
    unavailable: null,
  }[resolveSalesLanding(permissions)];
  const destination = moduleId === "sales"
    ? destinations.find((item) => item.id === salesDestination)
    : destinations[0];
  return destination ? staticNavigationTarget(destination.id) : null;
}

export function desktopStaticNavigationTarget(
  id: string,
): NavigationTarget | null {
  if (!supportedDestinations.has(id as StaticDestinationId)) return null;
  return staticNavigationTarget(id as StaticDestinationId);
}

/**
 * Resolves a Desktop route only when its required workspace grant is effective.
 * @param id - Requested static navigation identifier.
 * @param permissions - Effective permission grants for the active organization.
 * @returns The permitted target, or null for an unavailable route.
 */
export function permittedDesktopStaticNavigationTarget(
  id: string,
  permissions: readonly PermissionCode[],
): NavigationTarget | null {
  if (id === "sales.dashboard" && !canReadSalesDashboard(permissions)) return null;
  return desktopStaticNavigationTarget(id);
}

export function desktopBreadcrumbs(
  target: NavigationTarget | null,
  labels: Readonly<Record<string, string>> = {},
): readonly BreadcrumbEntry[] {
  return target ? resolveBreadcrumbs(target, labels) : [];
}
