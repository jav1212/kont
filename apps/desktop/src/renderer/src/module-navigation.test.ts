import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultModuleNavigationTarget,
  moduleNavigationSections,
  permittedDesktopStaticNavigationTarget,
} from "./module-navigation";

test("sales landing selects only the explicitly permitted destination", () => {
  assert.equal(defaultModuleNavigationTarget("sales", ["sales.read", "sales.read.dashboard"])?.id, "sales.dashboard");
  assert.equal(defaultModuleNavigationTarget("sales", ["sales.read", "sales.create"])?.id, "sales.point-of-sale");
  assert.equal(defaultModuleNavigationTarget("sales", ["sales.read"])?.id, "sales.archive");
});

test("sales navigation and direct dashboard route require the exact dashboard permission", () => {
  const sections = moduleNavigationSections("sales", null, ["sales.read"]);
  assert.equal(sections.flatMap((section) => section.items).some((item) => item.id === "sales.dashboard"), false);
  assert.equal(permittedDesktopStaticNavigationTarget("sales.dashboard", ["sales.read"]), null);
  assert.equal(permittedDesktopStaticNavigationTarget("sales.dashboard", ["sales.read.dashboard"]), null);
  assert.equal(permittedDesktopStaticNavigationTarget("sales.dashboard", ["sales.read", "sales.read.dashboard"])?.id, "sales.dashboard");
});
