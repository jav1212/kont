import assert from "node:assert/strict";
import test from "node:test";
import {
  NavigationCatalog,
  NavigationFailure,
  dynamicNavigationTarget,
  createNavigationLabels,
  createNavigationIcons,
  resolveBreadcrumbs,
  resolveNavigationTargetFromPath,
  staticNavigationTarget,
} from "../src/index";

test("validates semantic icon overrides against navigation and icon catalogs", () => {
  assert.deepEqual(createNavigationIcons({ sales: "shopping-cart", "inventory.products": "package" }), {
    sales: "shopping-cart",
    "inventory.products": "package",
  });
  assert.throws(
    () => createNavigationIcons({ sales: "cart-outline" }),
    (error: unknown) => error instanceof NavigationFailure && error.code === "NAVIGATION_ICONS_INVALID",
  );
  assert.throws(
    () => createNavigationIcons({ "unknown.destination": "shopping-cart" }),
    (error: unknown) => error instanceof NavigationFailure && error.code === "NAVIGATION_ICONS_INVALID",
  );
});

test("resolves a portable breadcrumb without platform routes", () => {
  const breadcrumb = resolveBreadcrumbs(staticNavigationTarget("payroll.employees"));
  assert.deepEqual(breadcrumb.map((entry) => ({ label: entry.label, id: entry.destination.id, current: entry.current })), [
    { label: "Inicio", id: "home", current: false },
    { label: "Nómina", id: "payroll", current: false },
    { label: "Empleados", id: "payroll.employees", current: true },
  ]);
  assert.equal("href" in breadcrumb[0]!, false);
});

test("resolves the most specific Web destination and dynamic route parameters", () => {
  assert.equal(resolveNavigationTargetFromPath("/payroll/employees")?.id, "payroll.employees");
  assert.deepEqual(resolveNavigationTargetFromPath("/sales/invoices/inv-42"), undefined);
  assert.equal(resolveNavigationTargetFromPath("/sales/sale-42")?.id, "sales.detail");
  assert.equal(resolveNavigationTargetFromPath("/payroll/employees/123"), undefined);
  assert.equal(resolveNavigationTargetFromPath("/fiscal/declaraciones/2026-10")?.id, "iva.declaration-detail");
  assert.equal(resolveNavigationTargetFromPath("/unknown/path"), undefined);
});

test("preserves typed parameters for a dynamic destination", () => {
  const target = dynamicNavigationTarget("companies.detail", { companyId: "company-1" });
  const breadcrumb = resolveBreadcrumbs(target, { "companies.detail": "Sucursal Caracas" });
  assert.deepEqual(breadcrumb.map((entry) => entry.label), ["Inicio", "Empresas", "Sucursal Caracas"]);
  assert.deepEqual(breadcrumb.at(-1)?.destination, target);
});

test("rejects missing dynamic destination parameters", () => {
  assert.throws(
    () => dynamicNavigationTarget("sales.detail", { saleId: "" }),
    (failure) => failure instanceof NavigationFailure && failure.code === "DESTINATION_PARAMETERS_INVALID",
  );
});

test("rejects a catalog whose parent is missing", () => {
  assert.throws(
    () => new NavigationCatalog([{ id: "child", label: "Child", parentId: "missing" }]),
    { code: "CATALOG_PARENT_NOT_FOUND" },
  );
});

test("rejects cyclic navigation hierarchies", () => {
  assert.throws(
    () => new NavigationCatalog([
      { id: "first", label: "First", parentId: "second" },
      { id: "second", label: "Second", parentId: "first" },
    ]),
    { code: "CATALOG_CYCLE" },
  );
});

test("rejects duplicate destinations", () => {
  assert.throws(
    () => new NavigationCatalog([
      { id: "same", label: "First", parentId: null },
      { id: "same", label: "Second", parentId: null },
    ]),
    { code: "CATALOG_DUPLICATE_DESTINATION" },
  );
});

test("navigation labels trim and freeze known destination overrides", () => {
  const labels = createNavigationLabels({ sales: "  Comercial  ", "sales.point-of-sale": "Caja" });
  assert.deepEqual(labels, { sales: "Comercial", "sales.point-of-sale": "Caja" });
  assert.equal(Object.isFrozen(labels), true);
  assert.deepEqual(resolveBreadcrumbs(staticNavigationTarget("sales.point-of-sale"), labels).map((entry) => entry.label), ["Inicio", "Comercial", "Caja"]);
});

test("navigation labels reject unknown destinations and unsafe label values", () => {
  assert.throws(() => createNavigationLabels({ "unknown.page": "Other" }), { code: "NAVIGATION_LABELS_INVALID" });
  assert.throws(() => createNavigationLabels({ sales: "  " }), { code: "NAVIGATION_LABELS_INVALID" });
  assert.throws(() => createNavigationLabels({ sales: "x".repeat(61) }), { code: "NAVIGATION_LABELS_INVALID" });
  assert.throws(() => createNavigationLabels({ sales: "bad\nlabel" }), { code: "NAVIGATION_LABELS_INVALID" });
  assert.throws(() => createNavigationLabels({ sales: "bad\n" }), { code: "NAVIGATION_LABELS_INVALID" });
});
