import assert from "node:assert/strict";
import test from "node:test";
import { organizationId } from "@kontave/organizations-domain";
import { ModuleCapability, ModuleCode, ModuleLifecycleStatus, Platform, moduleId } from "@kontave/modules-domain";
import { InMemoryModuleCatalog, InMemoryModuleEntitlements, InMemoryOrganizationModules } from "@kontave/modules-testing";
import { InstallModule, RequireModuleCapability, SuspendModule } from "../src/index.js";

const organization = organizationId("organization-1");
const inventory = { id: moduleId("inventory-id"), code: ModuleCode.Inventory, name: "Inventory", status: ModuleLifecycleStatus.Active, capabilities: [ModuleCapability.InventoryProducts], dependencies: [] as ModuleCode[], supportedPlatforms: [Platform.Web, Platform.Desktop] };

test("installs an entitled module through repositories", async () => {
  const installations = new InMemoryOrganizationModules();
  const installed = await new InstallModule(new InMemoryModuleCatalog([inventory]), installations, new InMemoryModuleEntitlements(new Set([ModuleCode.Inventory]))).execute(organization, ModuleCode.Inventory, new Date(0).toISOString());
  assert.equal(installed.moduleCode, ModuleCode.Inventory);
});

test("capability checks use active installations", async () => {
  const catalog = new InMemoryModuleCatalog([inventory]); const installations = new InMemoryOrganizationModules();
  await new InstallModule(catalog, installations, new InMemoryModuleEntitlements(new Set([ModuleCode.Inventory]))).execute(organization, ModuleCode.Inventory, new Date(0).toISOString());
  await new RequireModuleCapability(catalog, installations).execute(organization, ModuleCapability.InventoryProducts);
  await assert.rejects(() => new RequireModuleCapability(catalog, installations).execute(organization, ModuleCapability.AccountingEntries), { code: "MODULE_CAPABILITY_UNAVAILABLE" });
});

test("a module required by another active module cannot be suspended", async () => {
  const accounting = { ...inventory, id: moduleId("accounting-id"), code: ModuleCode.Accounting, dependencies: [ModuleCode.Inventory] };
  const catalog = new InMemoryModuleCatalog([inventory, accounting]);
  const installations = new InMemoryOrganizationModules();
  const entitlements = new InMemoryModuleEntitlements(new Set([ModuleCode.Inventory, ModuleCode.Accounting]));
  await new InstallModule(catalog, installations, entitlements).execute(organization, ModuleCode.Inventory, new Date(0).toISOString());
  await new InstallModule(catalog, installations, entitlements).execute(organization, ModuleCode.Accounting, new Date(0).toISOString());
  await assert.rejects(() => new SuspendModule(catalog, installations).execute(organization, ModuleCode.Inventory, new Date(1).toISOString()), { code: "MODULE_DEPENDENT_ACTIVE" });
});
