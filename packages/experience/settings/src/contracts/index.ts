import { PERMISSIONS, permissionCode, type PermissionCode } from "@kontave/access-control/domain";
import { Platform, type ModuleCode } from "@kontave/modules/domain";
import type { NavigationDestinationId } from "@kontave/navigation";

/** Supported ownership scopes for settings entries. */
export const SettingsScope = { User: "user", Organization: "organization", Company: "company", Installation: "installation" } as const;
/** Ownership scope assigned to a settings entry. */
export type SettingsScope = typeof SettingsScope[keyof typeof SettingsScope];
/** Supported behavioral classifications for settings entries. */
export const SettingsEntryKind = { Preference: "preference", Administration: "administration", Configuration: "configuration" } as const;
/** Behavioral classification assigned to a settings entry. */
export type SettingsEntryKind = typeof SettingsEntryKind[keyof typeof SettingsEntryKind];
/** Context evidence that a settings entry may require. */
export const SettingsContextRequirement = { AuthenticatedUser: "authenticated_user", ActiveOrganization: "active_organization", ActiveCompany: "active_company", Installation: "installation" } as const;
/** Context requirement declared by a settings entry. */
export type SettingsContextRequirement = typeof SettingsContextRequirement[keyof typeof SettingsContextRequirement];

/** Stable identifier for a settings section. */
export type SettingsSectionId = "account" | "organization" | "company" | "application";
/** Stable identifier for a settings entry. */
export type SettingsEntryId =
  | "account.profile" | "account.appearance" | "account.security"
  | "organization.general" | "organization.members" | "organization.roles" | "organization.billing"
  | "application.devices";
/** Translation key used by platform presentation adapters. */
export type SettingsMessageKey = `settings.${string}`;
/** Portable icon semantic used by platform presentation adapters. */
export type SettingsIconKey = "profile" | "appearance" | "security" | "organization" | "members" | "roles" | "billing" | "documents" | "devices";

/** Immutable definition of a settings section. */
export interface SettingsSectionDefinition {
  readonly id: SettingsSectionId;
  readonly labelKey: SettingsMessageKey;
  readonly order: number;
}

/** Immutable business and presentation metadata for a settings entry. */
export interface SettingsEntryDefinition {
  readonly id: SettingsEntryId;
  readonly sectionId: SettingsSectionId;
  readonly kind: SettingsEntryKind;
  readonly scope: SettingsScope;
  readonly presentation: { readonly labelKey: SettingsMessageKey; readonly descriptionKey: SettingsMessageKey; readonly iconKey: SettingsIconKey; readonly order: number };
  readonly destination: NavigationDestinationId;
  readonly platforms: readonly Platform[];
  readonly requiredContext: readonly SettingsContextRequirement[];
  readonly requiredModules: readonly ModuleCode[];
  readonly access: { readonly view: readonly PermissionCode[]; readonly manage: readonly PermissionCode[] };
  readonly supportsOffline: boolean;
}

const everyPlatform = Object.freeze([Platform.Web, Platform.Desktop, Platform.Mobile]);
const authenticated = Object.freeze([SettingsContextRequirement.AuthenticatedUser]);
const organization = Object.freeze([SettingsContextRequirement.AuthenticatedUser, SettingsContextRequirement.ActiveOrganization]);

/** Ordered catalog of settings sections shared by client platforms. */
export const SETTINGS_SECTIONS: readonly SettingsSectionDefinition[] = Object.freeze([
  { id: "account", labelKey: "settings.section.account", order: 10 },
  { id: "organization", labelKey: "settings.section.organization", order: 20 },
  { id: "company", labelKey: "settings.section.company", order: 30 },
  { id: "application", labelKey: "settings.section.application", order: 40 },
]);

/** Canonical catalog of settings entries shared by client platforms. */
export const SETTINGS_ENTRIES: readonly SettingsEntryDefinition[] = Object.freeze([
  entry("account.profile", "account", SettingsEntryKind.Administration, SettingsScope.User, "profile", "settings.profile", 10, everyPlatform, authenticated, [], [], [], false),
  entry("account.appearance", "account", SettingsEntryKind.Preference, SettingsScope.User, "appearance", "settings.appearance", 20, everyPlatform, authenticated, [], [], [], true),
  entry("account.security", "account", SettingsEntryKind.Administration, SettingsScope.User, "security", "settings.security", 30, everyPlatform, authenticated, [], [], [], false),
  entry("organization.general", "organization", SettingsEntryKind.Administration, SettingsScope.Organization, "organization", "settings.organization", 10, everyPlatform, organization, [], [], [], false),
  entry("organization.members", "organization", SettingsEntryKind.Administration, SettingsScope.Organization, "members", "settings.members", 20, everyPlatform, organization, [], [permissionCode(PERMISSIONS.MEMBERS_READ)], [permissionCode(PERMISSIONS.MEMBERS_INVITE)], false),
  entry("organization.roles", "organization", SettingsEntryKind.Administration, SettingsScope.Organization, "roles", "settings.roles", 30, everyPlatform, organization, [], [permissionCode(PERMISSIONS.ROLES_READ)], [permissionCode(PERMISSIONS.ROLES_MANAGE)], false),
  entry("organization.billing", "organization", SettingsEntryKind.Administration, SettingsScope.Organization, "billing", "settings.billing", 40, everyPlatform, organization, [], [permissionCode(PERMISSIONS.BILLING_READ)], [permissionCode(PERMISSIONS.BILLING_MANAGE)], false),
  entry("application.devices", "application", SettingsEntryKind.Configuration, SettingsScope.Installation, "devices", "settings.devices", 10, [Platform.Web, Platform.Desktop], [SettingsContextRequirement.AuthenticatedUser, SettingsContextRequirement.Installation], [], [], [], true),
]);

function entry(
  id: SettingsEntryId, sectionId: SettingsSectionId, kind: SettingsEntryKind, scope: SettingsScope,
  iconKey: SettingsIconKey, destination: NavigationDestinationId, order: number,
  platforms: readonly Platform[], requiredContext: readonly SettingsContextRequirement[], requiredModules: readonly ModuleCode[],
  view: readonly PermissionCode[], manage: readonly PermissionCode[], supportsOffline: boolean,
): SettingsEntryDefinition {
  const key = id.replaceAll(".", "_");
  return Object.freeze({
    id, sectionId, kind, scope,
    presentation: Object.freeze({ labelKey: `settings.${key}.label`, descriptionKey: `settings.${key}.description`, iconKey, order }),
    destination, platforms: Object.freeze([...platforms]), requiredContext: Object.freeze([...requiredContext]), requiredModules: Object.freeze([...requiredModules]),
    access: Object.freeze({ view: Object.freeze([...view]), manage: Object.freeze([...manage]) }), supportsOffline,
  });
}
