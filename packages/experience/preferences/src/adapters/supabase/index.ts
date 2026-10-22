import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { UserId } from "@kontave/organizations/domain";
import type { UserPreferencesRepository } from "../../application";
import {
  PreferencesFailure,
  createUserPreferences,
  createUserViewPreferences,
  createUserProcessDefaults,
  type UserPreferences,
  type UserViewPreferences,
  type UserProcessDefaults,
} from "../../domain";
import { z } from "zod";

const preferencesRowSchema = z.object({
  user_id: z.string(),
  color_scheme: z.enum(["light", "dark", "system"]),
  density: z.enum(["comfortable", "compact"]),
  locale: z.string(),
  time_zone: z.string(),
  version: z.number().int().nonnegative(),
  updated_at: z.string(),
});

export interface PreferencesRowSource {
  /**
   * Loads one raw preferences row.
   *
   * @param userId - Preferences owner identifier.
   * @returns Raw data and any database-reported error.
   */
  findByUser(userId: string): Promise<{ readonly data: unknown; readonly error: { readonly message: string } | null }>;
  /**
   * Saves one raw preferences row with optimistic concurrency.
   *
   * @param preferences - Validated snapshot to persist.
   * @param expectedVersion - Version that must currently be stored.
   * @returns Raw authoritative data and any database-reported error.
   */
  save(preferences: UserPreferences, expectedVersion: number): Promise<{ readonly data: unknown; readonly error: { readonly message: string; readonly code?: string } | null }>;
}

/** Supabase-backed user-preferences repository. */
export class SupabaseUserPreferencesRepository implements UserPreferencesRepository {
  /**
   * Creates a repository over an injectable row source.
   *
   * @param source - Raw persistence operations used by the adapter.
   */
  constructor(private readonly source: PreferencesRowSource) {}

  /**
   * Loads and validates preferences owned by a user.
   *
   * @param userId - Expected preferences owner.
   * @returns The decoded snapshot, or `null` when none exists.
   * @throws {PreferencesFailure} When persistence, decoding or ownership validation fails.
   */
  async findByUser(userId: UserId): Promise<UserPreferences | null> {
    try {
      const result = await this.source.findByUser(userId);
      if (result.error) throw unavailable(result.error);
      if (result.data === null) return null;
      return decode(result.data, userId);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }

  /**
   * Saves and validates preferences with optimistic concurrency.
   *
   * @param preferences - Validated preferences to persist.
   * @param expectedVersion - Version that must currently be stored.
   * @returns The decoded authoritative snapshot.
   * @throws {PreferencesFailure} When persistence, decoding, ownership or version validation fails.
   */
  async save(preferences: UserPreferences, expectedVersion: number): Promise<UserPreferences> {
    try {
      const result = await this.source.save(preferences, expectedVersion);
      if (result.error) {
        if (result.error.code === "P0001" && result.error.message.includes("PREFERENCES_VERSION_CONFLICT")) {
          throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "Preferences changed in another client.");
        }
        throw unavailable(result.error);
      }
      return decode(result.data, preferences.userId);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }
}

class SupabasePreferencesRowSource implements PreferencesRowSource {
  constructor(private readonly client: SupabaseClient) {}
  async findByUser(userId: string) {
    return this.client.from("user_preferences").select("user_id, color_scheme, density, locale, time_zone, version, updated_at").eq("user_id", userId).maybeSingle();
  }
  async save(preferences: UserPreferences, expectedVersion: number) {
    return this.client.rpc("update_user_preferences", {
      p_expected_version: expectedVersion,
      p_color_scheme: preferences.appearance.colorScheme,
      p_density: preferences.appearance.density,
      p_locale: preferences.regional.locale,
      p_time_zone: preferences.regional.timeZone,
    }).single();
  }
}

/** Authenticated client configuration for the preferences adapter. */
export interface SupabaseUserPreferencesConfiguration {
  readonly url: string;
  readonly anonKey: string;
  readonly accessToken: string;
}

/**
 * Creates an authenticated Supabase preferences repository without local session state.
 *
 * @param configuration - Supabase endpoint, anonymous key and caller access token.
 * @returns A configured user-preferences repository.
 * @throws When the Supabase client rejects invalid construction parameters.
 */
export function createSupabaseUserPreferencesRepository(configuration: SupabaseUserPreferencesConfiguration): SupabaseUserPreferencesRepository {
  const client = createClient(configuration.url, configuration.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${configuration.accessToken}` } },
  });
  return new SupabaseUserPreferencesRepository(new SupabasePreferencesRowSource(client));
}

function decode(value: unknown, expectedUserId: UserId): UserPreferences {
  const parsed = preferencesRowSchema.safeParse(value);
  if (!parsed.success || parsed.data.user_id !== expectedUserId) {
    throw new PreferencesFailure("PREFERENCES_INVALID", "Stored user preferences are invalid.", { cause: parsed.success ? undefined : parsed.error });
  }
  return createUserPreferences({
    userId: expectedUserId,
    appearance: { colorScheme: parsed.data.color_scheme, density: parsed.data.density },
    regional: { locale: parsed.data.locale, timeZone: parsed.data.time_zone },
    version: parsed.data.version,
    updatedAt: parsed.data.updated_at,
  });
}

function unavailable(cause: unknown): PreferencesFailure {
  return new PreferencesFailure("PREFERENCES_REPOSITORY_UNAVAILABLE", "User preferences are unavailable.", { cause });
}

function repositoryFailure(cause: unknown): PreferencesFailure {
  return cause instanceof PreferencesFailure ? cause : unavailable(cause);
}

const viewPreferencesRowSchema = z.object({
  user_id: z.string(),
  view_id: z.string(),
  hidden_field_ids: z.array(z.string()),
  hidden_column_ids: z.array(z.string()),
  version: z.number().int().positive(),
  updated_at: z.string(),
});

/** Raw row operations for isolated, user-owned view preferences. */
export interface UserViewPreferencesRowSource {
  /**
   * Loads one row by its composite owner/view key.
   * @param userId - Expected row owner.
   * @param viewId - Stable view key.
   * @returns Raw row or null and any source error.
   */
  find(userId: string, viewId: string): Promise<{ readonly data: unknown; readonly error: { readonly message: string } | null }>;
  /**
   * Writes the complete choice snapshot through the authenticated revision RPC.
   * @param preferences - Validated row snapshot.
   * @param expectedVersion - Revision observed before the edit.
   * @returns Authoritative raw row and any source error.
   */
  save(preferences: UserViewPreferences, expectedVersion: number): Promise<{ readonly data: unknown; readonly error: { readonly message: string; readonly code?: string } | null }>;
}

/** Supabase repository for per-user field and column visibility. */
export class SupabaseUserViewPreferencesRepository {
  /**
   * @param source - Authenticated persistence boundary for view-preference rows.
   */
  constructor(private readonly source: UserViewPreferencesRowSource) {}

  /**
   * Loads and validates choices for the exact owner/view key.
   * @param userId - Expected authenticated preference owner.
   * @param viewId - Stable view identifier.
   * @returns Validated row, or null when defaults still apply.
   * @throws {PreferencesFailure} When storage returns invalid or inaccessible data.
   */
  async find(userId: UserId, viewId: string): Promise<UserViewPreferences | null> {
    try {
      const result = await this.source.find(userId, viewId);
      if (result.error) throw unavailable(result.error);
      if (result.data === null) return null;
      return decodeViewPreferences(result.data, userId, viewId);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }

  /**
   * Saves view preferences with the expected revision and validates the authoritative response.
   * @param preferences - Candidate full snapshot.
   * @param expectedVersion - Version the row must currently have; zero creates it.
   * @returns Authoritative persisted choices.
   * @throws {PreferencesFailure} When the edit is stale, unauthorized, invalid, or unavailable.
   */
  async save(preferences: UserViewPreferences, expectedVersion: number): Promise<UserViewPreferences> {
    try {
      const result = await this.source.save(preferences, expectedVersion);
      if (result.error) {
        if (result.error.code === "P0001" && result.error.message.includes("PREFERENCES_VERSION_CONFLICT")) {
          throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "View preferences changed in another client.");
        }
        if (result.error.code === "P0001" && result.error.message.includes("PREFERENCES_INVALID")) {
          throw new PreferencesFailure("PREFERENCES_INVALID", "User view preferences are invalid.");
        }
        throw unavailable(result.error);
      }
      return decodeViewPreferences(result.data, preferences.userId, preferences.viewId);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }
}

class SupabaseUserViewPreferencesRowSource implements UserViewPreferencesRowSource {
  constructor(private readonly client: SupabaseClient) {}
  async find(userId: string, viewId: string) {
    return this.client.from("user_view_preferences")
      .select("user_id, view_id, hidden_field_ids, hidden_column_ids, version, updated_at")
      .eq("user_id", userId).eq("view_id", viewId).maybeSingle();
  }
  async save(preferences: UserViewPreferences, expectedVersion: number) {
    return this.client.rpc("update_user_view_preferences", {
      p_view_id: preferences.viewId,
      p_hidden_field_ids: preferences.hiddenFieldIds,
      p_hidden_column_ids: preferences.hiddenColumnIds,
      p_expected_version: expectedVersion,
    }).single();
  }
}

/**
 * Creates an authenticated user-view-preferences adapter without local session state.
 * @param configuration - Supabase endpoint, publishable key and caller access token.
 * @returns Repository guarded by authenticated RLS and the owner-derived update RPC.
 */
export function createSupabaseUserViewPreferencesRepository(configuration: SupabaseUserPreferencesConfiguration): SupabaseUserViewPreferencesRepository {
  const client = createClient(configuration.url, configuration.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${configuration.accessToken}` } },
  });
  return new SupabaseUserViewPreferencesRepository(new SupabaseUserViewPreferencesRowSource(client));
}

function decodeViewPreferences(value: unknown, expectedUserId: UserId, expectedViewId: string): UserViewPreferences {
  const parsed = viewPreferencesRowSchema.safeParse(value);
  if (!parsed.success || parsed.data.user_id !== expectedUserId || parsed.data.view_id !== expectedViewId) {
    throw new PreferencesFailure("PREFERENCES_INVALID", "Stored user view preferences are invalid.", { cause: parsed.success ? undefined : parsed.error });
  }
  return createUserViewPreferences({
    userId: expectedUserId,
    viewId: expectedViewId,
    hiddenFieldIds: parsed.data.hidden_field_ids,
    hiddenColumnIds: parsed.data.hidden_column_ids,
    version: parsed.data.version,
    updatedAt: parsed.data.updated_at,
  });
}

const processDefaultsRowSchema = z.object({
  user_id: z.string(), process_id: z.string(), values: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean(), z.null()])),
  version: z.number().int().positive(), updated_at: z.string(),
});

/** Raw persistence operations for private per-user process defaults. */
export interface UserProcessDefaultsRowSource {
  /**
   * Loads defaults by their exact user/process key.
   * @param userId - Expected owner.
   * @param processId - Stable process key.
   * @returns Raw row or null and any database error.
   */
  find(userId: string, processId: string): Promise<{ readonly data: unknown; readonly error: { readonly message: string } | null }>;
  /**
   * Writes through the authenticated owner-derived RPC.
   * @param defaults - Validated full defaults snapshot.
   * @param expectedVersion - Revision observed by the caller.
   * @returns Authoritative raw row and any database error.
   */
  save(defaults: UserProcessDefaults, expectedVersion: number): Promise<{ readonly data: unknown; readonly error: { readonly message: string; readonly code?: string } | null }>;
}

/** Supabase adapter for user-owned process defaults. */
export class SupabaseUserProcessDefaultsRepository {
  /**
   * @param source - Authenticated persistence boundary.
   */
  constructor(private readonly source: UserProcessDefaultsRowSource) {}

  /**
   * Loads and validates defaults for the exact owner/process scope.
   * @param userId - Expected authenticated owner.
   * @param processId - Stable process key.
   * @returns Validated defaults or null when no customized defaults exist.
   * @throws {PreferencesFailure} When persistence returns invalid or inaccessible data.
   */
  async find(userId: UserId, processId: string): Promise<UserProcessDefaults | null> {
    try {
      const result = await this.source.find(userId, processId);
      if (result.error) throw unavailable(result.error);
      if (result.data === null) return null;
      return decodeProcessDefaults(result.data, userId, processId);
    } catch (cause: unknown) { throw repositoryFailure(cause); }
  }

  /**
   * Saves process defaults with optimistic concurrency and validates the returned row.
   * @param defaults - Candidate complete snapshot.
   * @param expectedVersion - Observed revision, or zero for creation.
   * @returns Authoritative stored defaults.
   * @throws {PreferencesFailure} When the edit is stale, invalid, unauthorized, or unavailable.
   */
  async save(defaults: UserProcessDefaults, expectedVersion: number): Promise<UserProcessDefaults> {
    try {
      const result = await this.source.save(defaults, expectedVersion);
      if (result.error) {
        if (result.error.code === "P0001" && result.error.message.includes("PREFERENCES_VERSION_CONFLICT")) throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "Process defaults changed in another client.");
        if (result.error.code === "P0001" && result.error.message.includes("PREFERENCES_INVALID")) throw new PreferencesFailure("PREFERENCES_INVALID", "User process defaults are invalid.");
        throw unavailable(result.error);
      }
      return decodeProcessDefaults(result.data, defaults.userId, defaults.processId);
    } catch (cause: unknown) { throw repositoryFailure(cause); }
  }
}

class SupabaseUserProcessDefaultsRowSource implements UserProcessDefaultsRowSource {
  constructor(private readonly client: SupabaseClient) {}
  async find(userId: string, processId: string) {
    return this.client.from("user_process_defaults").select("user_id, process_id, values, version, updated_at")
      .eq("user_id", userId).eq("process_id", processId).maybeSingle();
  }
  async save(defaults: UserProcessDefaults, expectedVersion: number) {
    return this.client.rpc("update_user_process_defaults", { p_process_id: defaults.processId, p_values: defaults.values, p_expected_version: expectedVersion }).single();
  }
}

/**
 * Creates an authenticated Supabase adapter for user process defaults.
 * @param configuration - Endpoint, publishable key and caller access token.
 * @returns Repository scoped by RLS and owner-derived writes.
 */
export function createSupabaseUserProcessDefaultsRepository(configuration: SupabaseUserPreferencesConfiguration): SupabaseUserProcessDefaultsRepository {
  const client = createClient(configuration.url, configuration.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${configuration.accessToken}` } },
  });
  return new SupabaseUserProcessDefaultsRepository(new SupabaseUserProcessDefaultsRowSource(client));
}

function decodeProcessDefaults(value: unknown, expectedUserId: UserId, expectedProcessId: string): UserProcessDefaults {
  const parsed = processDefaultsRowSchema.safeParse(value);
  if (!parsed.success || parsed.data.user_id !== expectedUserId || parsed.data.process_id !== expectedProcessId) {
    throw new PreferencesFailure("PREFERENCES_INVALID", "Stored user process defaults are invalid.", { cause: parsed.success ? undefined : parsed.error });
  }
  return createUserProcessDefaults({ userId: expectedUserId, processId: expectedProcessId, values: parsed.data.values, version: parsed.data.version, updatedAt: parsed.data.updated_at });
}
