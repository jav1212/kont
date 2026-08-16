import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { UserId } from "@kontave/organizations-domain";
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
  findByUser(userId: string): Promise<{ readonly data: unknown; readonly error: { readonly message: string } | null }>;
  save(preferences: UserPreferences, expectedVersion: number): Promise<{ readonly data: unknown; readonly error: { readonly message: string; readonly code?: string } | null }>;
}

export class SupabaseUserPreferencesRepository implements UserPreferencesRepository {
  constructor(private readonly source: PreferencesRowSource) {}

  async findByUser(userId: UserId): Promise<UserPreferences | null> {
    const result = await this.source.findByUser(userId);
    if (result.error) throw unavailable(result.error);
    if (result.data === null) return null;
    return decode(result.data, userId);
  }

  async save(preferences: UserPreferences, expectedVersion: number): Promise<UserPreferences> {
    const result = await this.source.save(preferences, expectedVersion);
    if (result.error) {
      if (result.error.code === "P0001" && result.error.message.includes("PREFERENCES_VERSION_CONFLICT")) {
        throw new PreferencesFailure("PREFERENCES_VERSION_CONFLICT", "Preferences changed in another client.");
      }
      throw unavailable(result.error);
    }
    return decode(result.data, preferences.userId);
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

export function createSupabaseUserPreferencesRepository(configuration: { readonly url: string; readonly anonKey: string; readonly accessToken: string }): SupabaseUserPreferencesRepository {
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
