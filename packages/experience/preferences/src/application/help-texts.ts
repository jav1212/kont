import type { UserId } from "@kontave/organizations/domain";
import {
  PreferencesFailure,
  createUserProcessDefaults,
  defaultUserProcessDefaults,
  type UserProcessDefaults,
} from "../domain";
import type { PreferencesClock, UserProcessDefaultsRepository } from "./index";

const HELP_TEXTS_PROCESS = "help.texts";
const MAX_HELP_TEXT_LENGTH = 2_000;

/** Stable help topic owned and registered by a consuming capability. */
export interface HelpTopicDefinition {
  readonly id: string;
  readonly defaultText: string;
  /** Whether users may replace this topic's explanatory copy. */
  readonly customizable: boolean;
}

/** Effective help text values resolved against one capability-owned topic catalog. */
export interface UserHelpTexts {
  readonly userId: UserId;
  readonly texts: Readonly<Record<string, string>>;
  readonly version: number;
  readonly updatedAt: string;
}

/** Resolves user help text overrides while retaining registered defaults for uncustomized topics. */
export class GetEffectiveUserHelpTexts {
  /**
   * Creates the help text query.
   * @param repository - User-scoped process-default persistence.
   * @param clock - Source of timestamps for unpersisted defaults.
   * @returns A query that resolves help text for registered topics.
   */
  constructor(private readonly repository: UserProcessDefaultsRepository, private readonly clock: PreferencesClock) {}

  /**
   * Loads effective help text without creating preference rows.
   * @param command - User identity and catalog owned by the consuming capability.
   * @returns Every registered topic resolved to its user override or canonical text.
   * @throws {PreferencesFailure} When the catalog, stored values, or persistence is invalid.
   */
  async execute(command: { readonly userId: UserId; readonly catalog: readonly HelpTopicDefinition[] }): Promise<UserHelpTexts> {
    const catalog = parseCatalog(command.catalog);
    try {
      const stored = await this.repository.find(command.userId, HELP_TEXTS_PROCESS);
      return resolveTexts(stored ?? defaultUserProcessDefaults(command.userId, HELP_TEXTS_PROCESS, this.clock.now()), catalog);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }
}

/** Saves user help copy overrides under optimistic revision control. */
export class UpdateUserHelpTexts {
  /**
   * Creates the help text update command.
   * @param repository - User-scoped process-default persistence.
   * @param clock - Source of update audit timestamps.
   * @returns A command that validates and saves user help text overrides.
   */
  constructor(private readonly repository: UserProcessDefaultsRepository, private readonly clock: PreferencesClock) {}

  /**
   * Replaces all customizable help text overrides for one user.
   * @param command - User, registered catalog, expected revision and sparse replacement text.
   * @returns Effective help text after persistence succeeds.
   * @throws {PreferencesFailure} When the catalog, overrides, revision, or persistence is invalid.
   */
  async execute(command: {
    readonly userId: UserId;
    readonly catalog: readonly HelpTopicDefinition[];
    readonly expectedVersion: number;
    readonly texts: Readonly<Record<string, unknown>>;
  }): Promise<UserHelpTexts> {
    const catalog = parseCatalog(command.catalog);
    const values = parseOverrides(command.texts, catalog);
    let current: UserProcessDefaults | null;
    try {
      current = await this.repository.find(command.userId, HELP_TEXTS_PROCESS);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
    const effective = current ?? defaultUserProcessDefaults(command.userId, HELP_TEXTS_PROCESS, this.clock.now());
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion !== effective.version) {
      throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "Help texts changed in another client.");
    }
    const candidate = createUserProcessDefaults({
      ...effective,
      values,
      version: effective.version + 1,
      updatedAt: this.clock.now(),
    });
    try {
      return resolveTexts(await this.repository.save(candidate, effective.version), catalog);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }
}

function parseCatalog(input: readonly HelpTopicDefinition[]): ReadonlyMap<string, HelpTopicDefinition> {
  if (!Array.isArray(input) || input.length > 100) throw invalidHelpTexts();
  const topics = new Map<string, HelpTopicDefinition>();
  for (const topic of input) {
    if (!topic || typeof topic !== "object" || !/^[a-z][a-z0-9._-]{0,127}$/.test(topic.id)
      || typeof topic.customizable !== "boolean" || topics.has(topic.id)) throw invalidHelpTexts();
    const defaultText = normalizeText(topic.defaultText);
    topics.set(topic.id, Object.freeze({ id: topic.id, defaultText, customizable: topic.customizable }));
  }
  return topics;
}

function parseOverrides(
  input: Readonly<Record<string, unknown>>,
  catalog: ReadonlyMap<string, HelpTopicDefinition>,
): Readonly<Record<string, string>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidHelpTexts();
  const entries = Object.entries(input);
  if (entries.length > 100) throw invalidHelpTexts();
  const values: Record<string, string> = {};
  for (const [id, rawText] of entries) {
    const topic = catalog.get(id);
    if (!topic?.customizable || typeof rawText !== "string") throw invalidHelpTexts();
    values[id] = normalizeText(rawText);
  }
  return Object.freeze(values);
}

function normalizeText(value: string): string {
  if (typeof value !== "string" || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)) throw invalidHelpTexts();
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_HELP_TEXT_LENGTH) throw invalidHelpTexts();
  return normalized;
}

function resolveTexts(snapshot: UserProcessDefaults, catalog: ReadonlyMap<string, HelpTopicDefinition>): UserHelpTexts {
  const overrides = parseStoredOverrides(snapshot.values, catalog);
  const texts = Object.fromEntries([...catalog.values()].map(({ id, defaultText }) => [id, overrides[id] ?? defaultText]));
  return Object.freeze({ userId: snapshot.userId, texts: Object.freeze(texts), version: snapshot.version, updatedAt: snapshot.updatedAt });
}

function parseStoredOverrides(
  input: Readonly<Record<string, unknown>>,
  catalog: ReadonlyMap<string, HelpTopicDefinition>,
): Readonly<Record<string, string>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidHelpTexts();
  const entries = Object.entries(input);
  if (entries.length > 100) throw invalidHelpTexts();
  const values: Record<string, string> = {};
  for (const [id, rawText] of entries) {
    const topic = catalog.get(id);
    if (!topic?.customizable) continue;
    if (typeof rawText !== "string") throw invalidHelpTexts();
    values[id] = normalizeText(rawText);
  }
  return Object.freeze(values);
}

function invalidHelpTexts(): PreferencesFailure {
  return new PreferencesFailure("PREFERENCES_INVALID", "User help text overrides are invalid.");
}

function repositoryFailure(cause: unknown): PreferencesFailure {
  return cause instanceof PreferencesFailure
    ? cause
    : new PreferencesFailure("PREFERENCES_REPOSITORY_UNAVAILABLE", "User help texts are unavailable.", { cause });
}
