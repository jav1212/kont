import type { PermissionCode } from "@kontave/access-control-domain";
import { Platform, type ModuleCode } from "@kontave/modules-domain";
import { applicationNavigation } from "@kontave/navigation-domain";
import type { CompanyId, OrganizationId, UserId } from "@kontave/organizations-domain";
import { SettingsContextRequirement, type SettingsEntryDefinition, type SettingsEntryId, type SettingsSectionDefinition, type SettingsSectionId } from "@kontave/settings-contracts";

export type SettingsConnectivity = "online" | "offline";
export type SettingsAvailability = "available" | "read_only" | "disabled";
export type SettingsUnavailableReason = "missing_context" | "module_unavailable" | "offline" | null;

export interface SettingsResolutionContext {
  readonly platform: Platform;
  readonly connectivity: SettingsConnectivity;
  readonly userId: UserId | null;
  readonly organizationId: OrganizationId | null;
  readonly companyId: CompanyId | null;
  readonly installationId: string | null;
  readonly permissions: ReadonlySet<PermissionCode>;
  readonly availableModules: ReadonlySet<ModuleCode>;
}

export interface ResolvedSettingsEntry {
  readonly definition: SettingsEntryDefinition;
  readonly availability: SettingsAvailability;
  readonly unavailableReason: SettingsUnavailableReason;
}
export interface ResolvedSettingsSection { readonly definition: SettingsSectionDefinition; readonly entries: readonly ResolvedSettingsEntry[]; }

export interface SettingsCatalog {
  listSections(): readonly SettingsSectionDefinition[];
  listEntries(): readonly SettingsEntryDefinition[];
  findEntry(id: SettingsEntryId): SettingsEntryDefinition | null;
}

export type SettingsFailureCode = "SETTINGS_CATALOG_INVALID" | "SETTINGS_ENTRY_NOT_FOUND";
export class SettingsFailure extends Error {
  constructor(readonly code: SettingsFailureCode, message: string, options?: ErrorOptions) { super(message, options); this.name = "SettingsFailure"; }
}

export class StaticSettingsCatalog implements SettingsCatalog {
  private readonly entries: ReadonlyMap<SettingsEntryId, SettingsEntryDefinition>;
  private readonly sections: ReadonlyMap<SettingsSectionId, SettingsSectionDefinition>;
  constructor(sections: readonly SettingsSectionDefinition[], entries: readonly SettingsEntryDefinition[]) {
    this.sections = uniqueMap(sections, "section");
    this.entries = uniqueMap(entries, "entry");
    for (const entry of entries) {
      if (!this.sections.has(entry.sectionId)) throw invalid(`Settings section '${entry.sectionId}' does not exist.`);
      try { applicationNavigation.get(entry.destination); } catch (cause: unknown) { throw invalid(`Navigation destination '${entry.destination}' does not exist.`, cause); }
    }
  }
  listSections(): readonly SettingsSectionDefinition[] { return Object.freeze([...this.sections.values()]); }
  listEntries(): readonly SettingsEntryDefinition[] { return Object.freeze([...this.entries.values()]); }
  findEntry(id: SettingsEntryId): SettingsEntryDefinition | null { return this.entries.get(id) ?? null; }
}

export class ResolveAvailableSettings {
  constructor(private readonly catalog: SettingsCatalog) {}
  execute(context: SettingsResolutionContext): readonly ResolvedSettingsSection[] {
    const visible = this.catalog.listEntries()
      .filter((entry) => entry.platforms.includes(context.platform))
      .filter((entry) => hasAll(entry.access.view, context.permissions))
      .map((entry) => resolveEntry(entry, context));
    return Object.freeze([...this.catalog.listSections()]
      .sort((left, right) => left.order - right.order)
      .map((section) => Object.freeze({
        definition: section,
        entries: Object.freeze(visible.filter((entry) => entry.definition.sectionId === section.id)
          .sort((left, right) => left.definition.presentation.order - right.definition.presentation.order)),
      }))
      .filter((section) => section.entries.length > 0));
  }
}

function resolveEntry(definition: SettingsEntryDefinition, context: SettingsResolutionContext): ResolvedSettingsEntry {
  const unavailableReason = missingContext(definition, context)
    ? "missing_context"
    : definition.requiredModules.some((module) => !context.availableModules.has(module))
      ? "module_unavailable"
      : context.connectivity === "offline" && !definition.supportsOffline ? "offline" : null;
  const availability = unavailableReason ? "disabled" : hasAll(definition.access.manage, context.permissions) ? "available" : "read_only";
  return Object.freeze({ definition, availability, unavailableReason });
}

function missingContext(definition: SettingsEntryDefinition, context: SettingsResolutionContext): boolean {
  return definition.requiredContext.some((requirement) => {
    if (requirement === SettingsContextRequirement.AuthenticatedUser) return !context.userId;
    if (requirement === SettingsContextRequirement.ActiveOrganization) return !context.organizationId;
    if (requirement === SettingsContextRequirement.ActiveCompany) return !context.companyId;
    return !context.installationId;
  });
}
function hasAll(required: readonly PermissionCode[], actual: ReadonlySet<PermissionCode>): boolean { return required.every((permission) => actual.has(permission)); }
function uniqueMap<T extends { readonly id: TId }, TId extends string>(values: readonly T[], kind: string): ReadonlyMap<TId, T> {
  const result = new Map<TId, T>();
  for (const value of values) { if (result.has(value.id)) throw invalid(`Duplicate settings ${kind} '${value.id}'.`); result.set(value.id, value); }
  return result;
}
function invalid(message: string, cause?: unknown): SettingsFailure { return new SettingsFailure("SETTINGS_CATALOG_INVALID", message, cause === undefined ? undefined : { cause }); }
export { Platform };
