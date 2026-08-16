import assert from "node:assert/strict";
import test from "node:test";
import { PERMISSIONS, permissionCode } from "@kontave/access-control-domain";
import { Platform } from "@kontave/modules-domain";
import { companyId, organizationId, userId } from "@kontave/organizations-domain";
import { SETTINGS_ENTRIES, SETTINGS_SECTIONS } from "@kontave/settings-contracts";
import { ResolveAvailableSettings, StaticSettingsCatalog, type SettingsResolutionContext } from "../src/index.js";

function context(overrides: Partial<SettingsResolutionContext> = {}): SettingsResolutionContext {
  return { platform: Platform.Web, connectivity: "online", userId: userId("user-1"), organizationId: organizationId("org-1"), companyId: companyId("company-1"), installationId: "browser-1", permissions: new Set(), availableModules: new Set(), ...overrides };
}
const resolver = new ResolveAvailableSettings(new StaticSettingsCatalog(SETTINGS_SECTIONS, SETTINGS_ENTRIES));
function find(id: string, input: SettingsResolutionContext) { return resolver.execute(input).flatMap((section) => section.entries).find((entry) => entry.definition.id === id); }

test("resolves personal preferences for every supported client", () => {
  for (const platform of [Platform.Web, Platform.Desktop, Platform.Mobile]) assert.equal(find("account.appearance", context({ platform }))?.availability, "available");
});

test("does not expose administrative entries without view permission", () => {
  assert.equal(find("organization.billing", context()), undefined);
});

test("returns read-only when view permission exists without manage permission", () => {
  const permissions = new Set([permissionCode(PERMISSIONS.BILLING_READ)]);
  assert.equal(find("organization.billing", context({ permissions }))?.availability, "read_only");
});

test("enables management when every manage permission exists", () => {
  const permissions = new Set([permissionCode(PERMISSIONS.BILLING_READ), permissionCode(PERMISSIONS.BILLING_MANAGE)]);
  assert.equal(find("organization.billing", context({ permissions }))?.availability, "available");
});

test("disables online-only entries while preserving offline preferences", () => {
  const permissions = new Set([permissionCode(PERMISSIONS.BILLING_READ), permissionCode(PERMISSIONS.BILLING_MANAGE)]);
  assert.equal(find("organization.billing", context({ connectivity: "offline", permissions }))?.unavailableReason, "offline");
  assert.equal(find("account.appearance", context({ connectivity: "offline" }))?.availability, "available");
});

test("disables entries whose required context is missing", () => {
  const permissions = new Set([permissionCode(PERMISSIONS.COMPANIES_READ), permissionCode(PERMISSIONS.COMPANIES_UPDATE)]);
});

test("filters settings unsupported by the client platform", () => {
  assert.equal(find("application.devices", context({ platform: Platform.Mobile })), undefined);
});

test("rejects duplicate catalog entries", () => {
  assert.throws(() => new StaticSettingsCatalog(SETTINGS_SECTIONS, [SETTINGS_ENTRIES[0]!, SETTINGS_ENTRIES[0]!]), { code: "SETTINGS_CATALOG_INVALID" });
});
