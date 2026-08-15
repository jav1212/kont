import { Platform } from "@kontave/modules-domain";
import { userId } from "@kontave/organizations-domain";
import { StaticSettingsCatalog, type SettingsResolutionContext } from "@kontave/settings-application";
import { SETTINGS_ENTRIES, SETTINGS_SECTIONS, type SettingsEntryDefinition } from "@kontave/settings-contracts";

export function settingsContextFixture(overrides: Partial<SettingsResolutionContext> = {}): SettingsResolutionContext {
  return {
    platform: Platform.Web, connectivity: "online", userId: userId("user-fixture"), organizationId: null,
    companyId: null, installationId: "installation-fixture", permissions: new Set(), availableModules: new Set(), ...overrides,
  };
}
export function settingsEntryFixture(id: SettingsEntryDefinition["id"] = "account.appearance"): SettingsEntryDefinition {
  const definition = SETTINGS_ENTRIES.find((entry) => entry.id === id);
  if (!definition) throw new Error(`Unknown settings fixture '${id}'.`);
  return definition;
}
export function settingsCatalogFixture(entries: readonly SettingsEntryDefinition[] = SETTINGS_ENTRIES): StaticSettingsCatalog {
  return new StaticSettingsCatalog(SETTINGS_SECTIONS, entries);
}
