import type { PermissionCode } from "@kontave/access-control/domain";
import { Platform, type ModuleCode } from "@kontave/modules-domain";
import { applicationNavigation } from "@kontave/navigation";
import type { CompanyId, OrganizationId, UserId } from "@kontave/organizations/domain";
import { SettingsContextRequirement, type SettingsEntryDefinition, type SettingsEntryId, type SettingsSectionDefinition, type SettingsSectionId } from "../contracts/index";

/** Connectivity evidence used while resolving settings availability. */
export type SettingsConnectivity = "online" | "offline";
/** Effective interaction mode for a resolved settings entry. */
export type SettingsAvailability = "available" | "read_only" | "disabled";
/** Stable explanation for a disabled settings entry. */
export type SettingsUnavailableReason = "missing_context" | "module_unavailable" | "offline" | null;

/** Portable execution context used to resolve the settings catalog. */
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

/** Settings definition paired with its effective availability. */
export interface ResolvedSettingsEntry {
  readonly definition: SettingsEntryDefinition;
  readonly availability: SettingsAvailability;
  readonly unavailableReason: SettingsUnavailableReason;
}

/** Ordered settings section containing its visible resolved entries. */
export interface ResolvedSettingsSection {
  readonly definition: SettingsSectionDefinition;
  readonly entries: readonly ResolvedSettingsEntry[];
}

/** Read-only port exposing settings catalog knowledge. */
export interface SettingsCatalog {
  /**
   * Lists every declared section.
   * @returns Immutable section definitions in catalog insertion order.
   */
  listSections(): readonly SettingsSectionDefinition[];
  /**
   * Lists every declared entry.
   * @returns Immutable entry definitions in catalog insertion order.
   */
  listEntries(): readonly SettingsEntryDefinition[];
  /**
   * Finds a settings entry by its stable identifier.
   * @param id - Stable entry identifier.
   * @returns The matching definition, or `null` when it is absent.
   */
  findEntry(id: SettingsEntryId): SettingsEntryDefinition | null;
}

/** Stable classifications for expected settings failures. */
export type SettingsFailureCode = "SETTINGS_CATALOG_INVALID" | "SETTINGS_ENTRY_NOT_FOUND";
/** Expected typed failure produced by settings catalog operations. */
export class SettingsFailure extends Error {
  /**
   * Creates a settings failure with a stable public code.
   * @param code - Machine-readable failure classification.
   * @param message - Diagnostic description for trusted callers.
   * @param options - Optional standard error options, including a cause.
   */
  constructor(readonly code: SettingsFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SettingsFailure";
  }
}

/** Immutable catalog implementation backed by static definitions. */
export class StaticSettingsCatalog implements SettingsCatalog {
  private readonly entries: ReadonlyMap<SettingsEntryId, SettingsEntryDefinition>;
  private readonly sections: ReadonlyMap<SettingsSectionId, SettingsSectionDefinition>;
  /**
   * Creates and validates a static settings catalog.
   * @param sections - Unique section definitions.
   * @param entries - Unique entries referencing valid sections and destinations.
   * @throws {SettingsFailure} When identifiers are duplicated or references are invalid.
   */
  constructor(sections: readonly SettingsSectionDefinition[], entries: readonly SettingsEntryDefinition[]) {
    this.sections = uniqueMap(sections, "section");
    this.entries = uniqueMap(entries, "entry");
    for (const entry of entries) {
      if (!this.sections.has(entry.sectionId)) throw invalid(`Settings section '${entry.sectionId}' does not exist.`);
      try { applicationNavigation.get(entry.destination); } catch (cause: unknown) { throw invalid(`Navigation destination '${entry.destination}' does not exist.`, cause); }
    }
  }

  /** {@inheritDoc SettingsCatalog.listSections} */
  listSections(): readonly SettingsSectionDefinition[] {
    return Object.freeze([...this.sections.values()]);
  }

  /** {@inheritDoc SettingsCatalog.listEntries} */
  listEntries(): readonly SettingsEntryDefinition[] {
    return Object.freeze([...this.entries.values()]);
  }

  /** {@inheritDoc SettingsCatalog.findEntry} */
  findEntry(id: SettingsEntryId): SettingsEntryDefinition | null {
    return this.entries.get(id) ?? null;
  }
}

/** Resolves visible settings and interaction modes for a client context. */
export class ResolveAvailableSettings {
  /**
   * Creates the resolver around an explicit catalog port.
   * @param catalog - Catalog containing portable settings definitions.
   */
  constructor(private readonly catalog: SettingsCatalog) {}

  /**
   * Resolves settings visibility, ordering, and availability.
   * @param context - Current platform, ownership, access, module, and connectivity evidence.
   * @returns Immutable non-empty sections containing visible resolved entries.
   */
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
