import { writeFile } from "node:fs/promises";
import { NAVIGATION_DESTINATIONS, resolveBreadcrumbs, resolveNavigationTargetFromPath } from "../packages/experience/navigation/src/index";
import { APP_MODULES, MODULE_SUBNAV, navigationDestinationFor } from "../src/shared/frontend/navigation";

const routes = [
  "/payroll/tablero", "/payroll/employees", "/payroll/settings", "/payroll", "/payroll/vacations",
  "/payroll/profit-sharing", "/payroll/social-benefits", "/payroll/liquidations", "/payroll/ari", "/payroll/history",
  "/purchases", "/purchases/suppliers", "/purchases/import-book", "/purchases/archive", "/purchases/sample-invoice",
  "/purchases/suppliers/sample-supplier", "/sales", "/sales/pos", "/sales/customers", "/sales/archive", "/sales/igtf-fortnightly", "/sales/sample-sale",
  "/sales/fiscal/sample-document", "/inventory", "/inventory/products", "/inventory/products/sample-product", "/inventory/departments",
  "/inventory/departments/sample-category", "/inventory/sales", "/inventory/operations", "/inventory/compras-pendientes", "/inventory/compras-pendientes/sample-purchase",
  "/inventory/purchase-ledger", "/inventory/sales-ledger", "/inventory/inventory-ledger", "/inventory/report", "/inventory/balance-report", "/inventory/islr-report",
  "/treasury", "/treasury/movements", "/treasury/checks", "/treasury/deposits", "/treasury/payments", "/treasury/reconciliation", "/treasury/accounts", "/treasury/accounts/sample-account",
  "/treasury/checkbooks", "/treasury/beneficiaries", "/treasury/reports", "/treasury/tax-policy",
  "/payables", "/payables/documents", "/payables/documents/sample-document", "/payables/suppliers", "/payables/suppliers/sample-supplier", "/payables/schedule", "/payables/payments", "/payables/withholdings", "/payables/reconciliation",
  "/fiscal", "/fiscal/compras", "/fiscal/ventas", "/fiscal/pendientes", "/fiscal/importaciones", "/fiscal/declaraciones", "/fiscal/declaraciones/2026-10", "/fiscal/configuracion",
  "/accounting", "/accounting/charts", "/accounting/charts/sample-chart", "/accounting/accounts", "/accounting/accounts/sample-account", "/accounting/periods", "/accounting/integrations", "/accounting/journal", "/accounting/journal/sample-entry", "/accounting/trial-balance", "/accounting/financial-statements",
  "/documents", "/documents/files", "/documents/contracts", "/companies", "/companies/sample-company", "/tools", "/tools/divisas", "/tools/calendario-seniat", "/tools/status", "/tools/status/sample-portal",
  "/settings/organization", "/settings/members", "/settings/roles", "/settings/security", "/settings/billing", "/settings/devices", "/settings/apariencia", "/profile",
];
const catalogRoutes = [
  ...APP_MODULES.map((module) => ({ moduleId: "parentId" in module ? module.parentId ?? module.id : module.id, pathname: module.href })),
  ...Object.entries(MODULE_SUBNAV).flatMap(([moduleId, items]) => items.map((item) => ({ moduleId, pathname: item.href }))),
].map((route) => ({ ...route, legacyDestination: navigationDestinationFor(route.moduleId, route.pathname) }));
const allRoutes = [...new Set([...catalogRoutes.map((route) => route.pathname), ...routes])];

function baselineTrail(pathname: string): readonly { readonly label: string; readonly href: string | null }[] {
  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  const matchedModule = APP_MODULES.find((module) => {
    const moduleId = "parentId" in module ? module.parentId ?? module.id : module.id;
    return normalizedPath === `/${moduleId}` || normalizedPath.startsWith(`/${moduleId}/`);
  });
  const isSettingsPath = normalizedPath === "/profile" || normalizedPath === "/settings" || normalizedPath.startsWith("/settings/");
  if (!matchedModule && !isSettingsPath) return [{ label: "Registro de ejemplo", href: null }];
  const moduleId = isSettingsPath ? "settings" : matchedModule ? ("parentId" in matchedModule ? matchedModule.parentId ?? matchedModule.id : matchedModule.id) : undefined;
  if (!moduleId) return [{ label: "Registro de ejemplo", href: null }];
  const moduleDefinition = isSettingsPath ? { label: "Configuración", href: "/settings/organization" } : APP_MODULES.find((module) => module.id === moduleId) ?? matchedModule;
  if (!moduleDefinition) return [{ label: "Registro de ejemplo", href: null }];
  const matchingSubnav = (MODULE_SUBNAV[moduleId] ?? [])
    .filter((item) => normalizedPath === item.href || normalizedPath.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0];
  const destination = matchingSubnav ? navigationDestinationFor(moduleId, matchingSubnav.href) : undefined;
  const subnavLabel = destination ? matchingSubnav?.label : matchingSubnav?.label;
  const exactSubnav = Boolean(matchingSubnav && normalizedPath === matchingSubnav.href);
  const items: { label: string; href: string | null }[] = [
    { label: "Inicio", href: "/" },
    { label: moduleDefinition.label, href: moduleDefinition.href },
  ];
  if (matchingSubnav && exactSubnav) items.push({ label: subnavLabel ?? "Registro de ejemplo", href: null });
  else if (matchingSubnav && matchingSubnav.href !== moduleDefinition.href && normalizedPath.startsWith(`${matchingSubnav.href}/`)) {
    items.push({ label: subnavLabel ?? matchingSubnav.label, href: matchingSubnav.href });
    items.push({ label: "Registro de ejemplo", href: null });
  } else items.push({ label: "Registro de ejemplo", href: null });
  return items;
}

const snapshot = allRoutes.map((pathname) => {
  const target = resolveNavigationTargetFromPath(pathname);
  if (!target) throw new Error(`Route is not registered in navigation: ${pathname}`);
  const crumbs = resolveBreadcrumbs(target);
  return {
    pathname,
    legacyDestination: catalogRoutes.find((route) => route.pathname === pathname)?.legacyDestination ?? null,
    baselineTrail: baselineTrail(pathname),
    trail: crumbs.map((entry) => ({
      id: entry.destination.id,
      label: entry.label,
      href: entry.current ? null : NAVIGATION_DESTINATIONS.find((node) => node.id === entry.destination.id)?.webPath ?? null,
    })),
  };
});

await writeFile("docs/project/PLAN_BREADCRUMB_WEB.snapshot.json", `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
process.stdout.write(`Wrote ${snapshot.length} breadcrumb route snapshots.\n`);
