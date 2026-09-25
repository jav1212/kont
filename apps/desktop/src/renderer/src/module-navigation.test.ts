import assert from "node:assert/strict";
import test from "node:test";
import { permissionCode } from "@kontave/access-control/domain";
import {
  defaultModuleNavigationTarget,
  moduleNavigationSections,
  permittedDesktopStaticNavigationTarget,
} from "./module-navigation";

const permissions = (...values: string[]) => values.map(permissionCode);

test("sales landing selects only the explicitly permitted destination", () => {
  assert.equal(defaultModuleNavigationTarget("sales", permissions("sales.read", "sales.read.dashboard"))?.id, "sales.dashboard");
  assert.equal(defaultModuleNavigationTarget("sales", permissions("sales.read", "sales.create"))?.id, "sales.point-of-sale");
  assert.equal(defaultModuleNavigationTarget("sales", permissions("sales.read"))?.id, "sales.archive");
});

test("sales navigation and direct dashboard route require the exact dashboard permission", () => {
  const sections = moduleNavigationSections("sales", null, permissions("sales.read"));
  assert.equal(sections.flatMap((section) => section.items).some((item) => item.id === "sales.dashboard"), false);
  assert.equal(permittedDesktopStaticNavigationTarget("sales.dashboard", permissions("sales.read")), null);
  assert.equal(permittedDesktopStaticNavigationTarget("sales.dashboard", permissions("sales.read.dashboard")), null);
  assert.equal(permittedDesktopStaticNavigationTarget("sales.dashboard", permissions("sales.read", "sales.read.dashboard"))?.id, "sales.dashboard");
});
