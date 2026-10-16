import type { UserId } from "@kontave/organizations/domain";
import {
  PreferencesFailure,
  createUserProcessDefaults,
  defaultUserProcessDefaults,
  type UserProcessDefaults,
} from "../domain";
import type { PreferencesClock, UserProcessDefaultsRepository } from "./index";

const SYSTEM_LABELS_PROCESS = "system.labels";
const MAX_SYSTEM_LABEL_LENGTH = 60;

/** Stable system presentation label registered by a consuming capability. */
export interface SystemLabelDefinition {
  readonly id: string;
  readonly defaultLabel: string;
  /** Whether users may replace the visible label. */
  readonly customizable: boolean;
}

/** System labels resolved against a consumer-owned canonical label catalog. */
export interface UserSystemLabels {
  readonly userId: UserId;
  readonly labels: Readonly<Record<string, string>>;
  readonly version: number;
  readonly updatedAt: string;
}

/** Optional stable owner namespace for independently persisted label catalogs. */
export type SystemLabelCatalogId = string;

/** Resolves system label overrides without persisting defaults on first read. */
export class GetEffectiveUserSystemLabels {
  /**
   * Creates the system-label query.
   * @param repository - User-scoped process-default persistence.
   * @param clock - Source of timestamps for unpersisted defaults.
   * @returns A query that resolves a registered system-label catalog.
   */
  constructor(private readonly repository: UserProcessDefaultsRepository, private readonly clock: PreferencesClock) {}

  /**
   * Loads registered labels with user overrides and canonical fallback.
   * @param command - User identity, owning module's label catalog, and optional catalog namespace.
   * @returns Every registered label with its effective text and optimistic revision.
   * @throws {PreferencesFailure} When the catalog, stored values, or persistence is invalid.
   */
  async execute(command: {
    readonly userId: UserId;
    readonly catalog: readonly SystemLabelDefinition[];
    readonly catalogId?: SystemLabelCatalogId;
  }): Promise<UserSystemLabels> {
    const catalog = parseCatalog(command.catalog);
    const processId = processIdForCatalog(command.catalogId);
    try {
      const stored = await this.repository.find(command.userId, processId);
      return resolveLabels(stored ?? defaultUserProcessDefaults(command.userId, processId, this.clock.now()), catalog);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }
}

/** Saves user system-label overrides under optimistic revision control. */
export class UpdateUserSystemLabels {
  /**
   * Creates the system-label update command.
   * @param repository - User-scoped process-default persistence.
   * @param clock - Source of update audit timestamps.
   * @returns A command that validates and saves system-label overrides.
   */
  constructor(private readonly repository: UserProcessDefaultsRepository, private readonly clock: PreferencesClock) {}

  /**
   * Replaces all customizable system label overrides for one user.
   * @param command - User, registered label catalog, expected revision, sparse replacements, and optional catalog namespace.
   * @returns Effective labels after persistence succeeds.
   * @throws {PreferencesFailure} When labels, revision, or persistence is invalid.
   */
  async execute(command: {
    readonly userId: UserId;
    readonly catalog: readonly SystemLabelDefinition[];
    readonly catalogId?: SystemLabelCatalogId;
    readonly expectedVersion: number;
    readonly labels: Readonly<Record<string, unknown>>;
  }): Promise<UserSystemLabels> {
    const catalog = parseCatalog(command.catalog);
    const processId = processIdForCatalog(command.catalogId);
    const labels = parseOverrides(command.labels, catalog);
    let current: UserProcessDefaults | null;
    try {
      current = await this.repository.find(command.userId, processId);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
    const effective = current ?? defaultUserProcessDefaults(command.userId, SYSTEM_LABELS_PROCESS, this.clock.now());
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion !== effective.version) {
      throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "System labels changed in another client.");
    }
    const candidate = createUserProcessDefaults({
      ...effective,
      processId,
      values: labels,
      version: effective.version + 1,
      updatedAt: this.clock.now(),
    });
    try {
      return resolveLabels(await this.repository.save(candidate, effective.version), catalog);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }
}

function parseCatalog(input: readonly SystemLabelDefinition[]): ReadonlyMap<string, SystemLabelDefinition> {
  if (!Array.isArray(input) || input.length > 100) throw invalidSystemLabels();
  const labels = new Map<string, SystemLabelDefinition>();
  for (const definition of input) {
    if (!definition || typeof definition !== "object" || !/^system\.[a-z][a-z0-9._-]{0,119}$/.test(definition.id)
      || typeof definition.customizable !== "boolean" || labels.has(definition.id)) throw invalidSystemLabels();
    const defaultLabel = normalizeLabel(definition.defaultLabel);
    labels.set(definition.id, Object.freeze({ id: definition.id, defaultLabel, customizable: definition.customizable }));
  }
  return labels;
}

function parseOverrides(
  input: Readonly<Record<string, unknown>>,
  catalog: ReadonlyMap<string, SystemLabelDefinition>,
): Readonly<Record<string, string>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidSystemLabels();
  const entries = Object.entries(input);
  if (entries.length > 100) throw invalidSystemLabels();
  const labels: Record<string, string> = {};
  for (const [id, rawLabel] of entries) {
    const definition = catalog.get(id);
    if (!definition?.customizable || typeof rawLabel !== "string") throw invalidSystemLabels();
    labels[id] = normalizeLabel(rawLabel);
  }
  return Object.freeze(labels);
}

function parseStoredOverrides(
  input: Readonly<Record<string, unknown>>,
  catalog: ReadonlyMap<string, SystemLabelDefinition>,
): Readonly<Record<string, string>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidSystemLabels();
  const entries = Object.entries(input);
  if (entries.length > 100) throw invalidSystemLabels();
  const labels: Record<string, string> = {};
  for (const [id, rawLabel] of entries) {
    if (!catalog.get(id)?.customizable) continue;
    if (typeof rawLabel !== "string") throw invalidSystemLabels();
    labels[id] = normalizeLabel(rawLabel);
  }
  return Object.freeze(labels);
}

function normalizeLabel(value: string): string {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) throw invalidSystemLabels();
  const label = value.trim();
  if (!label || label.length > MAX_SYSTEM_LABEL_LENGTH) throw invalidSystemLabels();
  return label;
}

function resolveLabels(snapshot: UserProcessDefaults, catalog: ReadonlyMap<string, SystemLabelDefinition>): UserSystemLabels {
  const overrides = parseStoredOverrides(snapshot.values, catalog);
  const labels = Object.fromEntries([...catalog.values()].map(({ id, defaultLabel }) => [id, overrides[id] ?? defaultLabel]));
  return Object.freeze({ userId: snapshot.userId, labels: Object.freeze(labels), version: snapshot.version, updatedAt: snapshot.updatedAt });
}

function invalidSystemLabels(): PreferencesFailure {
  return new PreferencesFailure("PREFERENCES_INVALID", "User system-label overrides are invalid.");
}

function processIdForCatalog(catalogId?: SystemLabelCatalogId): string {
  if (catalogId === undefined) return SYSTEM_LABELS_PROCESS;
  if (typeof catalogId !== "string" || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){0,7}$/.test(catalogId)) {
    throw invalidSystemLabels();
  }
  const processId = `${SYSTEM_LABELS_PROCESS}.${catalogId}`;
  if (processId.length > 128) throw invalidSystemLabels();
  return processId;
}

function repositoryFailure(cause: unknown): PreferencesFailure {
  return cause instanceof PreferencesFailure
    ? cause
    : new PreferencesFailure("PREFERENCES_REPOSITORY_UNAVAILABLE", "User system labels are unavailable.", { cause });
}
