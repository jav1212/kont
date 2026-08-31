import { Platform } from "@kontave/modules/domain";
import { userId } from "@kontave/organizations/domain";
import { StaticSettingsCatalog, type SettingsResolutionContext } from "../application/index";
import { SETTINGS_ENTRIES, SETTINGS_SECTIONS, type SettingsEntryDefinition } from "../contracts/index";

/**
 * Creates a portable settings resolution context for deterministic tests.
 * @param overrides - Context values that replace fixture defaults.
 * @returns A complete settings resolution context.
 */
export function settingsContextFixture(overrides: Partial<SettingsResolutionContext> = {}): SettingsResolutionContext {
  return {
    platform: Platform.Web, connectivity: "online", userId: userId("user-fixture"), organizationId: null,
    companyId: null, installationId: "installation-fixture", permissions: new Set(), availableModules: new Set(), ...overrides,
  };
}

/**
 * Retrieves a canonical settings entry for tests.
 * @param id - Identifier of the desired canonical entry.
 * @returns The matching immutable settings definition.
 * @throws {Error} When the identifier is absent from the canonical catalog.
 */
export function settingsEntryFixture(id: SettingsEntryDefinition["id"] = "account.appearance"): SettingsEntryDefinition {
  const definition = SETTINGS_ENTRIES.find((entry) => entry.id === id);
  if (!definition) throw new Error(`Unknown settings fixture '${id}'.`);
  return definition;
}

/**
 * Creates a validated static settings catalog for tests.
 * @param entries - Entry definitions to include with the canonical sections.
 * @returns A validated static settings catalog.
 * @throws {SettingsFailure} When supplied entries make the catalog invalid.
 */
export function settingsCatalogFixture(entries: readonly SettingsEntryDefinition[] = SETTINGS_ENTRIES): StaticSettingsCatalog {
  return new StaticSettingsCatalog(SETTINGS_SECTIONS, entries);
}
