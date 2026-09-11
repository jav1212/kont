/** Permission required to render a route from the operational application. */
export type OrganizationRouteAccess =
  | { readonly kind: "authenticated" }
  | { readonly kind: "protected"; readonly permissions: readonly `${string}.${string}`[] }
  | { readonly kind: "unknown" };

export type OrganizationRouteAccessState = "loading" | "denied" | "allowed";

type ProtectedRouteDefinition = readonly [route: string, permissions: readonly `${string}.${string}`[]];

/**
 * All organization-scoped Web pages. New pages must be added explicitly: no
 * parent-module fallback is allowed because it could accidentally grant a new
 * write workflow to a read-only role.
 */
const PROTECTED_ROUTES: readonly ProtectedRouteDefinition[] = [
  ["/accounting", ["accounting.read"]], ["/accounting/accounts", ["accounting.read"]], ["/accounting/charts", ["accounting.read"]], ["/accounting/financial-statements", ["accounting.read"]], ["/accounting/integrations", ["accounting.read"]], ["/accounting/journal", ["accounting.read"]], ["/accounting/journal/[id]", ["accounting.read"]], ["/accounting/journal/new", ["accounting.read", "accounting.create"]], ["/accounting/periods", ["accounting.read"]], ["/accounting/trial-balance", ["accounting.read"]],
  ["/companies", ["companies.read"]], ["/companies/[id]", ["companies.read"]],
  ["/documents", ["documents.read"]], ["/documents/contracts", ["documents.read"]], ["/documents/files", ["documents.read"]],
  ["/inventory", ["inventory.read"]], ["/inventory/adjustments/generator", ["inventory.read", "inventory.create"]], ["/inventory/balance-report", ["inventory.read"]], ["/inventory/closings", ["inventory.read"]], ["/inventory/compras-pendientes", ["inventory.read"]], ["/inventory/compras-pendientes/[id]", ["inventory.read"]], ["/inventory/departments", ["inventory.read"]], ["/inventory/departments/[id]", ["inventory.read"]], ["/inventory/import", ["inventory.read", "inventory.create"]], ["/inventory/inventory-ledger", ["inventory.read"]], ["/inventory/islr-report", ["inventory.read"]], ["/inventory/movements", ["inventory.read"]], ["/inventory/operations", ["inventory.read"]], ["/inventory/operations/new", ["inventory.read", "inventory.create"]], ["/inventory/products", ["inventory.read"]], ["/inventory/products/[id]", ["inventory.read"]], ["/inventory/purchase-ledger", ["inventory.read"]], ["/inventory/report", ["inventory.read"]], ["/inventory/sales", ["inventory.read"]], ["/inventory/sales/generator", ["inventory.read", "inventory.create"]], ["/inventory/sales/new-manual", ["inventory.read", "inventory.create"]], ["/inventory/sales-ledger", ["inventory.read"]],
  ["/payroll", ["payroll.read"]], ["/payroll/ari", ["payroll.read"]], ["/payroll/employees", ["payroll.read", "employees.read"]], ["/payroll/history", ["payroll.read"]], ["/payroll/liquidations", ["payroll.read"]], ["/payroll/profit-sharing", ["payroll.read"]], ["/payroll/settings", ["payroll.read"]], ["/payroll/social-benefits", ["payroll.read"]], ["/payroll/tablero", ["payroll.read"]], ["/payroll/vacations", ["payroll.read"]],
  ["/purchases", ["purchases.read"]], ["/purchases/[id]", ["purchases.read"]], ["/purchases/archive", ["purchases.read"]], ["/purchases/import", ["purchases.read", "purchases.create", "inventory.create"]], ["/purchases/import-book", ["purchases.read", "purchases.create"]], ["/purchases/new", ["purchases.read", "purchases.create"]], ["/purchases/new/quick", ["purchases.read", "purchases.create"]], ["/purchases/new-manual", ["purchases.read", "purchases.create"]], ["/purchases/suppliers", ["purchases.read"]], ["/purchases/suppliers/[id]", ["purchases.read"]],
  ["/sales", ["sales.read"]], ["/sales/[id]", ["sales.read"]], ["/sales/archive", ["sales.read"]], ["/sales/customers", ["sales.read"]], ["/sales/igtf-fortnightly", ["sales.read"]], ["/sales/new", ["sales.read", "sales.create"]], ["/sales/pos", ["sales.read", "sales.create"]],
  ["/settings/organization", ["organizations.read"]],
  ["/settings/members", ["members.read"]],
  ["/settings/roles", ["roles.read"]],
  ["/settings/access", ["access.manage"]],
  ["/settings/company", ["companies.read"]],
  ["/settings/inventory-config", ["inventory.read", "companies.read"]],
  ["/settings/billing", ["billing.read"]],
  ["/settings/referrals", ["referrals.read"]],
];

/** Authenticated pages without organization-level permissions. */
const AUTHENTICATED_ROUTES = [
  "/",
  "/help",
  "/profile",
  "/tools",
  "/tools/calendario-seniat",
  "/tools/divisas",
  "/tools/status",
  "/tools/status/[slug]",
  "/settings/apariencia",
  "/settings/instalar-app",
  "/settings/devices",
] as const;

function routeMatchesTemplate(route: string, template: string): boolean {
  const routeParts = route.split("/").filter(Boolean);
  const templateParts = template.split("/").filter(Boolean);
  return routeParts.length === templateParts.length && templateParts.every((part, index) =>
    (part.startsWith("[") && part.endsWith("]")) || part === routeParts[index]);
}

/**
 * Resolves the organization permission for a Web pathname.
 *
 * More-specific prefixes must precede their parent prefix, such as employees
 * before the payroll module.
 *
 * @param pathname - Current pathname without query parameters.
 * @returns The permission requirement, authenticated personal route, or unknown route.
 */
export function getOrganizationRouteAccess(pathname: string): OrganizationRouteAccess {
  const route = pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
  // Prefer exact pages before dynamic detail templates (for example /sales/new
  // must not be interpreted as /sales/[id]).
  const match = PROTECTED_ROUTES.find(([template]) => template === route)
    ?? PROTECTED_ROUTES.find(([template]) => template.includes("[") && routeMatchesTemplate(route, template));
  if (match) return { kind: "protected", permissions: match[1] };
  if (AUTHENTICATED_ROUTES.some((template) => routeMatchesTemplate(route, template))) return { kind: "authenticated" };
  return { kind: "unknown" };
}

/**
 * Determines whether a permission list grants a requested action.
 *
 * @param permissions - Permissions from the selected organization snapshot.
 * @param permission - Requested resource/action pair.
 * @returns True for an explicit permission or the owner wildcard.
 */
export function hasOrganizationPermission(permissions: readonly string[], permission: `${string}.${string}`): boolean {
  return permissions.includes("*") || permissions.includes(permission);
}

/**
 * Applies a route requirement to a selected organization authorization snapshot.
 * Protected routes deny by default whenever the snapshot is incomplete.
 *
 * @param routeAccess - Requirement resolved from the pathname.
 * @param snapshot - Session, loading/error state, and the currently granted permissions.
 * @returns Loading, allowed, or denied without optimistically granting access.
 */
export function resolveOrganizationRouteAccess(
  routeAccess: OrganizationRouteAccess,
  snapshot: { readonly authStatus: "loading" | "authenticated" | "unauthenticated"; readonly loading: boolean; readonly error: string | null; readonly permissions: readonly string[] | null },
): OrganizationRouteAccessState {
  if (snapshot.authStatus === "loading") return "loading";
  if (snapshot.authStatus !== "authenticated") return "denied";
  if (routeAccess.kind === "authenticated") return "allowed";
  if (routeAccess.kind === "unknown") return "denied";
  if (snapshot.loading) return "loading";
  if (snapshot.error || !snapshot.permissions) return "denied";
  return routeAccess.permissions.every((permission) => hasOrganizationPermission(snapshot.permissions!, permission)) ? "allowed" : "denied";
}

/**
 * Maps a selectable module to its minimum visibility permission.
 *
 * @param moduleId - Navigation module identifier.
 * @returns Required read permission, or null for personal/public tools.
 */
export function getModuleVisibilityPermission(moduleId: string): `${string}.${string}` | null {
  switch (moduleId) {
    case "payroll": return "payroll.read";
    case "purchases": return "purchases.read";
    case "sales": return "sales.read";
    case "inventory": return "inventory.read";
    case "accounting": return "accounting.read";
    case "companies": return "companies.read";
    case "documents": return "documents.read";
    default: return null;
  }
}

/**
 * Identifies modules deliberately classified by the organization navigation policy.
 *
 * @param moduleId - Navigation module identifier.
 * @returns True only for explicitly public or permission-scoped modules.
 */
export function isKnownOrganizationModule(moduleId: string): boolean {
  return ["payroll", "purchases", "sales", "inventory", "accounting", "companies", "documents", "tools"].includes(moduleId);
}
