/** Permission required to render a route from the operational application. */
export type OrganizationRouteAccess =
  | { readonly kind: "public" }
  | { readonly kind: "protected"; readonly permissions: readonly `${string}.${string}`[] };

export type OrganizationRouteAccessState = "loading" | "denied" | "allowed" | "public";

const PROTECTED_ROUTE_PREFIXES: readonly [prefix: string, permissions: readonly `${string}.${string}`[]][] = [
  ["/payroll/employees", ["payroll.read", "employees.read"]],
  ["/payroll", ["payroll.read"]],
  ["/inventory", ["inventory.read"]],
  ["/purchases", ["purchases.read"]],
  ["/sales", ["sales.read"]],
  ["/accounting", ["accounting.read"]],
  ["/companies", ["companies.read"]],
  ["/documents", ["documents.read"]],
];

/**
 * Resolves the organization permission for a Web pathname.
 *
 * More-specific prefixes must precede their parent prefix, such as employees
 * before the payroll module.
 *
 * @param pathname - Current pathname without query parameters.
 * @returns The permission requirement, or public when the route is not owned by an operational module.
 */
export function getOrganizationRouteAccess(pathname: string): OrganizationRouteAccess {
  const route = pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
  const match = PROTECTED_ROUTE_PREFIXES.find(([prefix]) => route === prefix || route.startsWith(`${prefix}/`));
  return match ? { kind: "protected", permissions: match[1] } : { kind: "public" };
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
 * @param snapshot - Loading/error state and the currently granted permissions.
 * @returns Public, loading, allowed, or denied without optimistically granting access.
 */
export function resolveOrganizationRouteAccess(
  routeAccess: OrganizationRouteAccess,
  snapshot: { readonly loading: boolean; readonly error: string | null; readonly permissions: readonly string[] | null },
): OrganizationRouteAccessState {
  if (routeAccess.kind === "public") return "public";
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
