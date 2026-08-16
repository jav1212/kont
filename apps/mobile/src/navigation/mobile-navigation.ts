import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ModuleCode } from "@kontave/modules-domain";
import {
  applicationNavigation,
  resolveBreadcrumbs,
  staticNavigationTarget,
  type BreadcrumbEntry,
  type NavigationDestinationId,
  type NavigationParametersByDestination,
  type NavigationTarget,
} from "@kontave/navigation-domain";

export type MobileIconName = ComponentProps<typeof Ionicons>["name"];
export interface MobileNavigationItem { readonly id: NavigationDestinationId; readonly label: string; readonly icon: MobileIconName; }
export interface MobileNavigationSection { readonly title: string; readonly items: readonly MobileNavigationItem[]; }
type DynamicDestinationId = keyof NavigationParametersByDestination;
type StaticDestinationId = Exclude<NavigationDestinationId, DynamicDestinationId>;

const MODULE_ICONS: Readonly<Record<ModuleCode, MobileIconName>> = {
  [ModuleCode.Payroll]: "people-outline",
  [ModuleCode.Purchases]: "cart-outline",
  [ModuleCode.Sales]: "storefront-outline",
  [ModuleCode.Inventory]: "cube-outline",
  [ModuleCode.Accounting]: "calculator-outline",
  [ModuleCode.Tools]: "construct-outline",
  [ModuleCode.Companies]: "business-outline",
  [ModuleCode.Documents]: "documents-outline",
};

const MODULE_ITEMS: Readonly<Partial<Record<ModuleCode, readonly { readonly title: string; readonly destinations: readonly [NavigationDestinationId, MobileIconName][] }[]>>> = {
  [ModuleCode.Payroll]: [
    { title: "Operación", destinations: [["payroll.dashboard", "grid-outline"], ["payroll.employees", "people-outline"], ["payroll.calculator", "calculator-outline"]] },
    { title: "Beneficios", destinations: [["payroll.vacations", "sunny-outline"], ["payroll.social-benefits", "shield-checkmark-outline"], ["payroll.profit-sharing", "pie-chart-outline"], ["payroll.liquidations", "document-text-outline"], ["payroll.ari", "receipt-outline"]] },
    { title: "Control", destinations: [["payroll.history", "time-outline"], ["payroll.settings", "options-outline"]] },
  ],
  [ModuleCode.Inventory]: [
    { title: "Inventario", destinations: [["inventory.dashboard", "grid-outline"], ["inventory.products", "cube-outline"], ["inventory.departments", "layers-outline"], ["inventory.operations", "swap-horizontal-outline"], ["inventory.outputs", "arrow-up-circle-outline"]] },
    { title: "Reportes", destinations: [["inventory.purchase-ledger", "book-outline"], ["inventory.sales-ledger", "reader-outline"], ["inventory.inventory-ledger", "albums-outline"], ["inventory.period-report", "calendar-outline"], ["inventory.balance-report", "bar-chart-outline"]] },
  ],
  [ModuleCode.Purchases]: [{ title: "Compras", destinations: [["purchases.dashboard", "grid-outline"], ["purchases.suppliers", "business-outline"], ["purchases.import-book", "cloud-upload-outline"], ["purchases.archive", "archive-outline"]] }],
  [ModuleCode.Sales]: [{ title: "Ventas", destinations: [["sales.dashboard", "grid-outline"], ["sales.point-of-sale", "storefront-outline"], ["sales.customers", "people-outline"], ["sales.archive", "archive-outline"], ["sales.igtf", "receipt-outline"]] }],
  [ModuleCode.Accounting]: [{ title: "Contabilidad", destinations: [["accounting.dashboard", "grid-outline"], ["accounting.charts", "git-branch-outline"], ["accounting.accounts", "list-outline"], ["accounting.periods", "calendar-outline"], ["accounting.journal", "book-outline"], ["accounting.trial-balance", "scale-outline"], ["accounting.financial-statements", "document-text-outline"]] }],
  [ModuleCode.Documents]: [{ title: "Documentos", destinations: [["documents.dashboard", "grid-outline"], ["documents.files", "folder-open-outline"], ["documents.contracts", "document-text-outline"]] }],
  [ModuleCode.Tools]: [{ title: "Herramientas", destinations: [["tools.dashboard", "grid-outline"], ["tools.exchange-rates", "cash-outline"], ["tools.seniat-calendar", "calendar-outline"], ["tools.platform-status", "pulse-outline"]] }],
  [ModuleCode.Companies]: [{ title: "Empresas", destinations: [["companies", "business-outline"]] }],
};

const supportedDestinations = new Set<StaticDestinationId>([
  ...Object.values(MODULE_ITEMS).flatMap((sections) => sections?.flatMap((section) => section.destinations.map(([id]) => id as StaticDestinationId)) ?? []),
  "home", "profile", "help", "settings",
]);

export function mobileModuleNavigation(code: ModuleCode | null): readonly MobileNavigationSection[] {
  if (!code) return [];
  return (MODULE_ITEMS[code] ?? []).map((section) => ({ title: section.title, items: section.destinations.map(([id, icon]) => ({ id, icon, label: applicationNavigation.get(id).label })) }));
}

export function mobileModuleIcon(code: ModuleCode | null): MobileIconName {
  return code ? MODULE_ICONS[code] : "apps-outline";
}

export function defaultMobileNavigationTarget(code: ModuleCode | null): NavigationTarget {
  const first = code ? MODULE_ITEMS[code]?.[0]?.destinations[0]?.[0] : undefined;
  return staticNavigationTarget((first ?? "home") as StaticDestinationId);
}

export function mobileStaticNavigationTarget(id: string): NavigationTarget | null {
  if (!supportedDestinations.has(id as StaticDestinationId)) return null;
  return staticNavigationTarget(id as StaticDestinationId);
}

export function mobileBreadcrumbs(target: NavigationTarget): readonly BreadcrumbEntry[] {
  return resolveBreadcrumbs(target);
}
