import type { UserId } from "@kontave/organizations/domain";
import { PreferencesFailure, createUserProcessDefaults, defaultUserProcessDefaults, type ProcessDefaultValue, type UserProcessDefaults } from "../domain";
import type { PreferencesClock, UserProcessDefaultsRepository } from "./index";

/** One capability-owned parameter that may be customized for a business process. */
export type ProcessParameterDefinition =
  | { readonly id: string; readonly kind: "boolean"; readonly defaultValue: boolean; readonly customizable: boolean }
  | { readonly id: string; readonly kind: "number"; readonly defaultValue: number; readonly customizable: boolean; readonly min: number; readonly max: number }
  | { readonly id: string; readonly kind: "text"; readonly defaultValue: string; readonly customizable: boolean; readonly maxLength: number }
  | { readonly id: string; readonly kind: "choice"; readonly defaultValue: string; readonly customizable: boolean; readonly options: readonly string[] };

/** Stable process identity and bounded parameter definitions supplied by its owning capability. */
export interface ProcessParameterCatalog {
  readonly processId: string;
  readonly parameters: readonly ProcessParameterDefinition[];
}

/** Effective typed values and the revision used for optimistic updates. */
export interface UserProcessParameters {
  readonly userId: UserId;
  readonly processId: string;
  readonly values: Readonly<Record<string, ProcessDefaultValue>>;
  readonly version: number;
  readonly updatedAt: string;
}

/** Reads typed process parameters, applying canonical defaults without a write. */
export class GetEffectiveUserProcessParameters {
  /**
   * @param repository - User-scoped process preference persistence.
   * @param clock - Time source for an unpersisted version-zero snapshot.
   * @returns A query bound to these persistence and time dependencies.
   */
  constructor(private readonly repository: UserProcessDefaultsRepository, private readonly clock: PreferencesClock) {}

  /**
   * @param command - Authenticated owner and capability-owned parameter catalog.
   * @returns Effective typed values and their persisted revision.
   * @throws {PreferencesFailure} When the catalog or persistence is invalid.
   */
  async execute(command: { readonly userId: UserId; readonly catalog: ProcessParameterCatalog }): Promise<UserProcessParameters> {
    const catalog = parseCatalog(command.catalog);
    const processId = storageKey(catalog.processId);
    let stored: UserProcessDefaults | null;
    try { stored = await this.repository.find(command.userId, processId); }
    catch (cause) { throw repositoryFailure(cause); }
    return resolve(stored ?? defaultUserProcessDefaults(command.userId, processId, this.clock.now()), catalog);
  }
}

/** Replaces a user's sparse process parameters under optimistic concurrency. */
export class UpdateUserProcessParameters {
  /**
   * @param repository - User-scoped process preference persistence.
   * @param clock - Time source for the updated revision.
   * @returns A command bound to these persistence and time dependencies.
   */
  constructor(private readonly repository: UserProcessDefaultsRepository, private readonly clock: PreferencesClock) {}

  /**
   * @param command - Owner, catalog, expected revision and complete sparse override map.
   * @returns Effective values after the authoritative write.
   * @throws {PreferencesFailure} When values are unknown, immutable, out of range, stale or persistence fails.
   */
  async execute(command: {
    readonly userId: UserId;
    readonly catalog: ProcessParameterCatalog;
    readonly expectedVersion: number;
    readonly values: Readonly<Record<string, unknown>>;
  }): Promise<UserProcessParameters> {
    const catalog = parseCatalog(command.catalog);
    const values = parseOverrides(command.values, catalog, false);
    const processId = storageKey(catalog.processId);
    let stored: UserProcessDefaults | null;
    try { stored = await this.repository.find(command.userId, processId); }
    catch (cause) { throw repositoryFailure(cause); }
    const current = stored ?? defaultUserProcessDefaults(command.userId, processId, this.clock.now());
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion !== current.version) {
      throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "Process parameters changed in another client.");
    }
    const candidate = createUserProcessDefaults({ ...current, values, version: current.version + 1, updatedAt: this.clock.now() });
    try { return resolve(await this.repository.save(candidate, current.version), catalog); }
    catch (cause) { throw repositoryFailure(cause); }
  }
}

function parseCatalog(input: ProcessParameterCatalog): ProcessParameterCatalog {
  if (!input || typeof input.processId !== "string" || !/^[a-z][a-z0-9._-]{0,95}$/.test(input.processId) || !Array.isArray(input.parameters) || input.parameters.length > 100) throw invalid();
  const ids = new Set<string>();
  const parameters = input.parameters.map((item) => {
    if (!item || typeof item.id !== "string" || !/^[a-z][a-z0-9._-]{0,127}$/.test(item.id) || ids.has(item.id) || typeof item.customizable !== "boolean") throw invalid();
    ids.add(item.id);
    if (item.kind === "boolean") {
      if (typeof item.defaultValue !== "boolean") throw invalid();
    } else if (item.kind === "number") {
      if (![item.defaultValue, item.min, item.max].every((value) => typeof value === "number" && Number.isFinite(value)) || item.min > item.max || item.defaultValue < item.min || item.defaultValue > item.max) throw invalid();
    } else if (item.kind === "text") {
      if (!Number.isSafeInteger(item.maxLength) || item.maxLength < 1 || item.maxLength > 2_000 || !validText(item.defaultValue, item.maxLength)) throw invalid();
    } else if (item.kind === "choice") {
      if (!Array.isArray(item.options) || item.options.length < 1 || item.options.length > 100 || new Set(item.options).size !== item.options.length || item.options.some((option: string) => !validText(option, 128)) || !item.options.includes(item.defaultValue)) throw invalid();
    } else throw invalid();
    return item.kind === "choice"
      ? Object.freeze({ ...item, options: Object.freeze([...item.options]) })
      : Object.freeze({ ...item });
  });
  return Object.freeze({ processId: input.processId, parameters: Object.freeze(parameters) });
}

function parseOverrides(input: Readonly<Record<string, unknown>>, catalog: ProcessParameterCatalog, stored: boolean): Readonly<Record<string, ProcessDefaultValue>> {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length > 100) throw invalid();
  const definitions = new Map(catalog.parameters.map((item) => [item.id, item]));
  const result: Record<string, ProcessDefaultValue> = {};
  for (const [id, value] of Object.entries(input)) {
    const definition = definitions.get(id);
    if (!definition?.customizable) {
      if (stored) continue;
      throw invalid();
    }
    const valid = definition.kind === "boolean" ? typeof value === "boolean"
      : definition.kind === "number" ? typeof value === "number" && Number.isFinite(value) && value >= definition.min && value <= definition.max
      : definition.kind === "text" ? validText(value, definition.maxLength)
      : definition.options.includes(value as string);
    if (!valid) throw invalid();
    if (value !== definition.defaultValue) result[id] = value as ProcessDefaultValue;
  }
  return Object.freeze(result);
}

function resolve(snapshot: UserProcessDefaults, catalog: ProcessParameterCatalog): UserProcessParameters {
  const overrides = parseOverrides(snapshot.values, catalog, true);
  const values = Object.fromEntries(catalog.parameters.map((item) => [item.id, overrides[item.id] ?? item.defaultValue]));
  return Object.freeze({ userId: snapshot.userId, processId: catalog.processId, values: Object.freeze(values), version: snapshot.version, updatedAt: snapshot.updatedAt });
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value);
}

function storageKey(processId: string): string { return `process.parameters.${processId}`; }
function invalid(): PreferencesFailure { return new PreferencesFailure("PREFERENCES_INVALID", "Process parameter catalog or values are invalid."); }
function repositoryFailure(cause: unknown): PreferencesFailure {
  return cause instanceof PreferencesFailure ? cause : new PreferencesFailure("PREFERENCES_REPOSITORY_UNAVAILABLE", "User process parameters are unavailable.", { cause });
}
