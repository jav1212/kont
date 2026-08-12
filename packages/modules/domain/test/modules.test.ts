import assert from "node:assert/strict";
import test from "node:test";
import { ModuleCapability, ModuleCode, ModuleLifecycleStatus, Platform, assertModuleCanActivate, moduleId, moduleProvides } from "../src/index.js";

const accounting = { id: moduleId("accounting-id"), code: ModuleCode.Accounting, name: "Accounting", status: ModuleLifecycleStatus.Active, capabilities: [ModuleCapability.AccountingEntries], dependencies: [] as ModuleCode[], supportedPlatforms: [Platform.Web] };
test("capabilities are resolved by definitions rather than module-name comparisons", () => assert.equal(moduleProvides(accounting, ModuleCapability.AccountingEntries), true));
test("activation requires commercial entitlement", () => assert.throws(() => assertModuleCanActivate(accounting, false, new Set()), { code: "MODULE_NOT_ENTITLED" }));
test("activation requires all declared dependencies", () => {
  const dependent = { ...accounting, dependencies: [ModuleCode.Inventory] };
  assert.throws(() => assertModuleCanActivate(dependent, true, new Set()), { code: "MODULE_DEPENDENCY_MISSING" });
});
