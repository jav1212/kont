import { PERMISSIONS, permissionCode, type PermissionCode } from "@kontave/access-control-domain";
import { ModuleCode, Platform } from "@kontave/modules-domain";
import { companyId, organizationId, userId } from "@kontave/organizations-domain";
import { ResolveAvailableSettings, StaticSettingsCatalog } from "@kontave/settings-application";
import { SETTINGS_ENTRIES, SETTINGS_SECTIONS, type SettingsMessageKey } from "@kontave/settings-contracts";
import type { ConnectivitySnapshot } from "@kontave/client-connectivity-contracts";
import type { DesktopAuthState, DesktopWorkspaceState } from "../../shared/desktop-api.js";
import type { DesktopSettingsSection } from "./settings-view.js";

const resolver = new ResolveAvailableSettings(new StaticSettingsCatalog(SETTINGS_SECTIONS, SETTINGS_ENTRIES));

const messages: Readonly<Partial<Record<SettingsMessageKey, string>>> = {
  "settings.section.account": "Cuenta",
  "settings.section.organization": "Organización",
  "settings.section.company": "Empresa",
  "settings.section.application": "Aplicación",
  "settings.account_profile.label": "Perfil personal",
  "settings.account_profile.description": "Identidad, avatar y datos personales.",
  "settings.account_appearance.label": "Apariencia",
  "settings.account_appearance.description": "Tema y densidad de la interfaz.",
  "settings.account_security.label": "Seguridad",
  "settings.account_security.description": "Contraseña y seguridad de la cuenta.",
  "settings.organization_general.label": "Información de la organización",
  "settings.organization_general.description": "Nombre y datos generales de la organización.",
  "settings.organization_members.label": "Miembros",
  "settings.organization_members.description": "Personas con acceso a la organización.",
  "settings.organization_roles.label": "Roles y permisos",
  "settings.organization_roles.description": "Permisos disponibles para cada tipo de usuario.",
  "settings.organization_billing.label": "Facturación",
  "settings.organization_billing.description": "Plan, pagos y métodos de pago.",
  "settings.application_devices.label": "Dispositivos",
  "settings.application_devices.description": "Scanners, impresoras y equipos conectados.",
};

export function resolveDesktopSettings(input: {
  readonly auth: Extract<DesktopAuthState, { status: "authenticated" }>;
  readonly connectivity: ConnectivitySnapshot;
  readonly workspace: DesktopWorkspaceState;
}): readonly DesktopSettingsSection[] {
  const workspace = input.workspace.status === "ready" ? input.workspace : null;
  const activeWorkspace = workspace?.workspaces.find((entry) => entry.id === workspace.activeWorkspaceId) ?? null;
  const resolved = resolver.execute({
    platform: Platform.Desktop,
    connectivity: input.connectivity.availability === "unavailable"
      || (input.connectivity.availability === "unknown" && input.connectivity.reason !== null)
      ? "offline"
      : "online",
    userId: userId(input.auth.user.id),
    organizationId: workspace?.activeWorkspaceId ? organizationId(workspace.activeWorkspaceId) : null,
    companyId: workspace?.activeCompanyId ? companyId(workspace.activeCompanyId) : null,
    // Settings resolution only needs evidence that this native installation exists.
    // A durable installation identity can replace this sentinel when that capability is introduced.
    installationId: "kontave-desktop",
    permissions: resolvePermissions(activeWorkspace?.scopes ?? []),
    availableModules: new Set(workspace?.modules.map(({ id }) => id as ModuleCode) ?? []),
  });
  return resolved.map((section) => ({
    id: section.definition.id,
    label: translate(section.definition.labelKey),
    entries: section.entries.map((entry) => ({
      id: entry.definition.id,
      label: translate(entry.definition.presentation.labelKey),
      description: translate(entry.definition.presentation.descriptionKey),
      iconKey: entry.definition.presentation.iconKey,
      destination: entry.definition.destination,
      availability: entry.availability,
    })),
  }));
}

function resolvePermissions(scopes: readonly string[]): ReadonlySet<PermissionCode> {
  const values = scopes.includes("*") ? Object.values(PERMISSIONS) : scopes;
  const permissions = new Set<PermissionCode>();
  for (const value of values) {
    try { permissions.add(permissionCode(value)); }
    catch { /* Older APIs may include scopes unknown to this client version. */ }
  }
  return permissions;
}

function translate(key: SettingsMessageKey): string {
  return messages[key] ?? key;
}
