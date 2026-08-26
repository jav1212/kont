import assert from "node:assert/strict";
import test from "node:test";
import { ModuleCapability, ModuleCode, ModuleFailure, ModuleLifecycleStatus, Platform, assertModuleCanActivate, moduleId, moduleProvides, platform } from "../src/index";

const accounting = { id: moduleId("accounting-id"), code: ModuleCode.Accounting, name: "Accounting", status: ModuleLifecycleStatus.Active, capabilities: [ModuleCapability.AccountingEntries], dependencies: [] as ModuleCode[], supportedPlatforms: [Platform.Web] };
test("capabilities are resolved by definitions rather than module-name comparisons", () => assert.equal(moduleProvides(accounting, ModuleCapability.AccountingEntries), true));
test("activation requires commercial entitlement", () => assert.throws(() => assertModuleCanActivate(accounting, false, new Set()), { code: "MODULE_NOT_ENTITLED" }));
test("activation requires all declared dependencies", () => {
  const dependent = { ...accounting, dependencies: [ModuleCode.Inventory] };
  assert.throws(() => assertModuleCanActivate(dependent, true, new Set()), { code: "MODULE_DEPENDENCY_MISSING" });
});
test("platform accepts only supported client identifiers", () => {
  assert.equal(platform("desktop"), Platform.Desktop);
  assert.throws(() => platform("electron"), (failure) => failure instanceof ModuleFailure && failure.code === "MODULE_INVALID");
});
