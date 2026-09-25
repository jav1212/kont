import assert from "node:assert/strict";
import test from "node:test";
import { salesDashboardAccessRequirement } from "@kontave/sales/application";
import {
  getModuleVisibilityPermission,
  getOrganizationRouteAccess,
  hasOrganizationPermission,
  resolveSalesLanding,
  resolveOrganizationRouteAccess,
} from "../src/modules/organizations/frontend/module-access-policy";

const authenticated = { authStatus: "authenticated" as const, loading: false, error: null };

test("un cajero puede usar inventario y ventas, pero no nómina", () => {
  const permissions = ["inventory.read", "sales.read"];
  assert.equal(hasOrganizationPermission(permissions, getModuleVisibilityPermission("inventory")!), true);
  assert.equal(hasOrganizationPermission(permissions, getModuleVisibilityPermission("sales")!), true);
  assert.equal(hasOrganizationPermission(permissions, getModuleVisibilityPermission("payroll")!), false);
});

test("el wildcard de owner autoriza módulos de la organización", () => {
  assert.equal(hasOrganizationPermission(["*"], "payroll.read"), true);
  assert.equal(hasOrganizationPermission(["*"], "documents.read"), true);
});

test("carga, error o falta de organización no conceden acceso protegido", () => {
  const protectedRoute = getOrganizationRouteAccess("/inventory");
  assert.equal(resolveOrganizationRouteAccess(protectedRoute, { ...authenticated, loading: true, permissions: ["inventory.read"] }), "loading");
  assert.equal(resolveOrganizationRouteAccess(protectedRoute, { ...authenticated, error: "failed", permissions: ["inventory.read"] }), "denied");
  assert.equal(resolveOrganizationRouteAccess(protectedRoute, { ...authenticated, permissions: null }), "denied");
  assert.equal(hasOrganizationPermission([], "inventory.read"), false);
  assert.equal(getModuleVisibilityPermission("tools"), null);
});

test("un módulo recordado no autorizado no tiene permiso de visibilidad", () => {
  const rememberedModule = "payroll";
  const requirement = getModuleVisibilityPermission(rememberedModule);
  assert.ok(requirement);
  assert.equal(hasOrganizationPermission(["sales.read"], requirement), false);
});

test("la ruta de empleados requiere nómina y empleados", () => {
  const access = getOrganizationRouteAccess("/payroll/employees");
  assert.deepEqual(access, { kind: "protected", permissions: ["payroll.read", "employees.read"] });
  if (access.kind === "protected") {
    assert.equal(access.permissions.every((permission) => hasOrganizationPermission(["payroll.read"], permission)), false);
    assert.equal(access.permissions.every((permission) => hasOrganizationPermission(["payroll.read", "employees.read"], permission)), true);
  }
});

test("las rutas desconocidas no heredan permisos del módulo", () => {
  assert.deepEqual(getOrganizationRouteAccess("/payroll-archive"), { kind: "unknown" });
  assert.deepEqual(getOrganizationRouteAccess("/sales/example/unregistered-action"), { kind: "unknown" });
  assert.deepEqual(getOrganizationRouteAccess("/settings/unregistered-page"), { kind: "unknown" });
  assert.deepEqual(getOrganizationRouteAccess("/tools"), { kind: "authenticated" });
});

test("las pantallas de creación requieren leer y crear", () => {
  for (const route of ["/sales/new", "/purchases/new", "/accounting/journal/new"]) {
    const access = getOrganizationRouteAccess(route);
    assert.equal(access.kind, "protected");
    if (access.kind === "protected") {
      assert.equal(access.permissions.some((permission) => permission.endsWith(".create")), true);
      assert.equal(resolveOrganizationRouteAccess(access, { ...authenticated, permissions: [access.permissions[0]!] }), "denied");
    }
  }
});

test("cashier cannot open organization administration settings", () => {
  const cashierPermissions = ["companies.read", "inventory.read", "sales.read", "sales.create"];
  for (const route of ["/settings/organization", "/settings/members", "/settings/access", "/settings/billing", "/settings/roles"]) {
    assert.equal(resolveOrganizationRouteAccess(getOrganizationRouteAccess(route), { ...authenticated, permissions: cashierPermissions }), "denied");
  }
});

test("organization configuration requires update permission", () => {
  const configuration = getOrganizationRouteAccess("/settings/organization");
  assert.deepEqual(configuration, { kind: "protected", permissions: ["organizations.update"] });
  assert.equal(resolveOrganizationRouteAccess(configuration, { ...authenticated, permissions: ["organizations.read"] }), "denied");
  assert.equal(resolveOrganizationRouteAccess(configuration, { ...authenticated, permissions: ["organizations.update"] }), "allowed");
  assert.equal(resolveOrganizationRouteAccess(configuration, { ...authenticated, permissions: ["*"] }), "allowed");
});

test("read-only inventory user cannot open a creation workflow", () => {
  const inventoryCreate = getOrganizationRouteAccess("/inventory/operations/new");
  assert.equal(resolveOrganizationRouteAccess(inventoryCreate, { ...authenticated, permissions: ["inventory.read"] }), "denied");
});

test("the Sales dashboard needs its explicit read capability", () => {
  const dashboard = getOrganizationRouteAccess("/sales");
  assert.deepEqual(dashboard, { kind: "protected", permissions: salesDashboardAccessRequirement });
  assert.equal(resolveOrganizationRouteAccess(dashboard, { ...authenticated, permissions: ["sales.read", "sales.create"] }), "denied");
  assert.equal(resolveOrganizationRouteAccess(dashboard, { ...authenticated, permissions: ["sales.read", "sales.read.dashboard"] }), "allowed");
});

test("a cashier retains operational Sales access without the dashboard", () => {
  const cashier = ["sales.read", "sales.create"];
  assert.equal(resolveOrganizationRouteAccess(getOrganizationRouteAccess("/sales/archive"), { ...authenticated, permissions: cashier }), "allowed");
  assert.equal(resolveOrganizationRouteAccess(getOrganizationRouteAccess("/sales/pos"), { ...authenticated, permissions: cashier }), "allowed");
  assert.equal(resolveSalesLanding(cashier), "/sales/pos");
  assert.equal(resolveSalesLanding(["sales.read"]), "/sales/archive");
  assert.equal(resolveSalesLanding(["sales.read", "sales.read.dashboard"]), "/sales");
  assert.equal(resolveSalesLanding([]), null);
});

test("personal routes require a resolved authenticated session", () => {
  const personalRoute = getOrganizationRouteAccess("/profile");
  assert.equal(resolveOrganizationRouteAccess(personalRoute, { authStatus: "loading", loading: false, error: null, permissions: null }), "loading");
  assert.equal(resolveOrganizationRouteAccess(personalRoute, { authStatus: "unauthenticated", loading: false, error: null, permissions: null }), "denied");
  assert.equal(resolveOrganizationRouteAccess(personalRoute, { ...authenticated, permissions: null }), "allowed");
});

test("cashier can use exact personal routes but not business routes", () => {
  const cashier = ["companies.read", "inventory.read", "sales.read", "sales.create"];
  assert.equal(resolveOrganizationRouteAccess(getOrganizationRouteAccess("/tools/status/example"), { ...authenticated, permissions: cashier }), "allowed");
  assert.equal(resolveOrganizationRouteAccess(getOrganizationRouteAccess("/payroll"), { ...authenticated, permissions: cashier }), "denied");
  assert.deepEqual(getOrganizationRouteAccess("/tools/status/example/nested"), { kind: "unknown" });
});
