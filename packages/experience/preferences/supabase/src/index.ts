import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { UserId } from "@kontave/organizations/domain";
import type { UserPreferencesRepository } from "@kontave/preferences-application";
import {
  PreferencesFailure,
  createUserPreferences,
  type UserPreferences,
} from "@kontave/preferences-domain";
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
