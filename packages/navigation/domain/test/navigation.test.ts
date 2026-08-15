import assert from "node:assert/strict";
import test from "node:test";
import {
  NavigationCatalog,
  NavigationFailure,
  dynamicNavigationTarget,
  resolveBreadcrumbs,
  staticNavigationTarget,
} from "../src/index.js";

test("resolves a portable breadcrumb without platform routes", () => {
  const breadcrumb = resolveBreadcrumbs(staticNavigationTarget("payroll.employees"));
  assert.deepEqual(breadcrumb.map((entry) => ({ label: entry.label, id: entry.destination.id, current: entry.current })), [
    { label: "Inicio", id: "home", current: false },
    { label: "Nómina", id: "payroll", current: false },
    { label: "Empleados", id: "payroll.employees", current: true },
  ]);
  assert.equal("href" in breadcrumb[0]!, false);
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
