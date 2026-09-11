import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PERMISSIONS } from "@kontave/access-control/domain";
import ts from "typescript";
import { getOrganizationRouteAccess } from "../src/modules/organizations/frontend/module-access-policy";
import { APP_MODULES, MODULE_SUBNAV } from "../src/shared/frontend/navigation";
import { inferPermissionFromRequest } from "../src/shared/backend/utils/require-tenant";
import { hasRegisteredWebApiRoute } from "../src/modules/organizations/backend/web-api-route-access";

const root = fileURLToPath(new URL("../", import.meta.url));
const pageRoot = join(root, "app", "(app)");
const knownPermissions = new Set<string>(Object.values(PERMISSIONS));

/**
 * Finds application entry points without reading generated build output.
 * @param directory - Absolute application directory to inspect recursively.
 * @param filename - Exact entry point filename to include.
 * @returns Absolute paths to the matching entry points.
 * @throws Error when a source directory cannot be read.
 */
async function filesNamedIn(directory: string, filename: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const descendants = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesNamedIn(path, filename);
    return entry.name === filename ? [path] : [];
  }));
  return descendants.flat();
}

const pages = await filesNamedIn(pageRoot, "page.tsx");
const paths = new Set(pages.map((page) => {
  const segments = relative(pageRoot, dirname(page)).split(sep)
    .filter((segment) => segment && !segment.startsWith("(") && !segment.startsWith("@"));
  return `/${segments.join("/")}`;
}));
const navigation = [...APP_MODULES, ...Object.values(MODULE_SUBNAV).flat()];
const failures: string[] = [];
let tenantHandlers = 0;

for (const file of await filesNamedIn(join(root, "app", "api"), "route.ts")) {
  const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
  const pathname = `/${relative(join(root, "app"), dirname(file)).split(sep).join("/")}`;
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(declaration.name.text)) continue;
      const initializer = declaration.initializer;
      if (!initializer || !ts.isCallExpression(initializer) || !ts.isIdentifier(initializer.expression)) continue;
      const wrapper = initializer.expression.text;
      if (!["withTenant", "withTenantPermission", "withTenantPermissions"].includes(wrapper)) continue;
      tenantHandlers += 1;
      const method = declaration.name.text;
      if (wrapper === "withTenant") {
        if (initializer.arguments.length !== 1) {
          failures.push(`${method} ${pathname}: route handlers cannot bypass their registered permission policy`);
        }
        if (!hasRegisteredWebApiRoute(method, pathname)) {
          failures.push(`${method} ${pathname}: no exact API route policy (dynamic or module fallback is not accepted)`);
        }
        const permission = inferPermissionFromRequest(new Request(`https://route-audit.invalid${pathname}`, { method }));
        if (permission !== null && !knownPermissions.has(permission)) {
          failures.push(`${method} ${pathname}: unclassified API permission ${permission}`);
        }
      } else {
        const argument = initializer.arguments[0];
        const permissions = argument && ts.isArrayLiteralExpression(argument) ? argument.elements : argument ? [argument] : [];
        if (permissions.length === 0) failures.push(`${method} ${pathname}: empty explicit API permission requirement`);
        for (const permission of permissions) {
          if (!ts.isStringLiteral(permission) || !knownPermissions.has(permission.text)) {
            failures.push(`${method} ${pathname}: API permission must be an explicit canonical code`);
          }
        }
      }
    }
  }
}

// An unregistered route must not acquire access from a public/default branch.
// A one-segment sales path can match its intentional [id] detail route, so use
// an unknown nested action when checking the operational module boundary.
for (const pathname of ["/unregistered-module", "/settings/unregistered-page", "/sales/example/unregistered-action", "/profile/unregistered-action", "/tools/unregistered-page"]) {
  const access = getOrganizationRouteAccess(pathname);
  if (access.kind !== "unknown") {
    failures.push(`${pathname}: unknown route is not denied by default`);
  }
}

for (const pathname of new Set([...paths, ...navigation.map((entry) => entry.href)])) {
  const access = getOrganizationRouteAccess(pathname);
  if (access.kind === "protected") {
    if (access.permissions.length === 0) failures.push(`${pathname}: empty permission requirement`);
    for (const permission of access.permissions) {
      if (!knownPermissions.has(permission)) failures.push(`${pathname}: unknown permission ${permission}`);
    }
  } else if (access.kind !== "authenticated") {
    failures.push(`${pathname}: no explicit route access policy`);
  }
}

if (failures.length > 0) {
  console.error(`Route authorization audit failed:\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Route authorization audit passed: ${paths.size} pages, ${navigation.length} navigation entries, and ${tenantHandlers} tenant API handlers classified.`);
}
