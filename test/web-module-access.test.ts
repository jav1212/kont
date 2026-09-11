import assert from "node:assert/strict";
import test from "node:test";
import {
  getModuleVisibilityPermission,
  getOrganizationRouteAccess,
  hasOrganizationPermission,
  resolveOrganizationRouteAccess,
} from "../src/modules/organizations/frontend/module-access-policy";

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
  assert.equal(resolveOrganizationRouteAccess(protectedRoute, { loading: true, error: null, permissions: ["inventory.read"] }), "loading");
  assert.equal(resolveOrganizationRouteAccess(protectedRoute, { loading: false, error: "falló", permissions: ["inventory.read"] }), "denied");
  assert.equal(resolveOrganizationRouteAccess(protectedRoute, { loading: false, error: null, permissions: null }), "denied");
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

test("los prefijos de ruta no coinciden parcialmente", () => {
  assert.deepEqual(getOrganizationRouteAccess("/payroll-archive"), { kind: "public" });
  assert.deepEqual(getOrganizationRouteAccess("/tools"), { kind: "public" });
});
