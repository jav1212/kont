import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ProfileFailure,
  type ProfileDetails,
  type ProfileDetailsReader,
} from "@kontave/profile-application";
import { z } from "zod";

const profileRowSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

export interface ProfileRowSource {
  findByUserId(userId: string): Promise<{
    readonly data: unknown;
    readonly error: { readonly message: string } | null;
  }>;
}

export interface SupabaseProfileConfiguration {
  readonly url: string;
  readonly anonKey: string;
  readonly accessToken: string;
}

export class SupabaseProfileDetailsReader implements ProfileDetailsReader {
  constructor(private readonly source: ProfileRowSource) {}

  async findByUserId(userId: string): Promise<ProfileDetails | null> {
    const { data, error } = await this.source.findByUserId(userId);

    if (error) {
      throw new ProfileFailure(
        "PROFILE_REPOSITORY_UNAVAILABLE",
        "No se pudo consultar el perfil.",
        { cause: error },
      );
    }
    if (data === null) return null;

    const parsed = profileRowSchema.safeParse(data);
    if (!parsed.success || parsed.data.id !== userId) {
      throw new ProfileFailure(
        "PROFILE_DATA_INVALID",
        "El perfil almacenado no es válido.",
        { cause: parsed.success ? undefined : parsed.error },
      );
    }

    return {
      displayName: parsed.data.name?.trim() || null,
      avatarUrl: parsed.data.avatar_url,
    };
  }
}

class SupabaseProfileRowSource implements ProfileRowSource {
  constructor(private readonly client: SupabaseClient) {}

  async findByUserId(userId: string): Promise<{
    readonly data: unknown;
    readonly error: { readonly message: string } | null;
  }> {
    return this.client
      .from("profiles")
      .select("id, name, avatar_url")
      .eq("id", userId)
      .maybeSingle();
  }
}

export function createSupabaseProfileDetailsReader(
  configuration: SupabaseProfileConfiguration,
): SupabaseProfileDetailsReader {
  const client: SupabaseClient = createClient(configuration.url, configuration.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${configuration.accessToken}` } },
  });
  return new SupabaseProfileDetailsReader(new SupabaseProfileRowSource(client));
}
