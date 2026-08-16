import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ProfileFailure,
  type ProfileDetails,
  type ProfileRepository,
  type ProfileAvatarStorage,
} from "@kontave/profile-application";
import { z } from "zod";

const profileRowSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  version: z.number().int().nonnegative(),
});

export interface ProfileRowSource {
  findByUserId(userId: string): Promise<{
    readonly data: unknown;
    readonly error: { readonly message: string } | null;
  }>;
  update?(changes: { readonly displayName?: string | null; readonly avatarUrl?: string | null }, expectedVersion: number): Promise<{ readonly data: unknown; readonly error: { readonly message: string; readonly code?: string } | null }>;
}

export interface SupabaseProfileConfiguration {
  readonly url: string;
  readonly anonKey: string;
  readonly accessToken: string;
}

export class SupabaseProfileDetailsReader implements ProfileRepository {
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
      version: parsed.data.version,
    };
  }

  async update(userId: string, changes: { readonly displayName?: string | null; readonly avatarUrl?: string | null }, expectedVersion: number): Promise<ProfileDetails> {
    if (!this.source.update) throw new ProfileFailure("PROFILE_REPOSITORY_UNAVAILABLE", "No se pudo actualizar el perfil.");
    const { data, error } = await this.source.update(changes, expectedVersion);
    if (error) {
      if (error.code === "P0001" && error.message.includes("PROFILE_VERSION_CONFLICT")) throw new ProfileFailure("PROFILE_VERSION_CONFLICT", "El perfil cambió en otro cliente.");
      throw new ProfileFailure("PROFILE_REPOSITORY_UNAVAILABLE", "No se pudo actualizar el perfil.", { cause: error });
    }
    const parsed = profileRowSchema.safeParse(data);
    if (!parsed.success || parsed.data.id !== userId) throw new ProfileFailure("PROFILE_DATA_INVALID", "El perfil almacenado no es válido.");
    return { displayName: parsed.data.name?.trim() || null, avatarUrl: parsed.data.avatar_url, version: parsed.data.version };
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
      .select("id, name, avatar_url, version")
      .eq("id", userId)
      .maybeSingle();
  }

  async update(changes: { readonly displayName?: string | null; readonly avatarUrl?: string | null }, expectedVersion: number) {
    return this.client.rpc("update_current_profile", {
      p_expected_version: expectedVersion,
      p_display_name: changes.displayName,
      p_avatar_url: changes.avatarUrl,
      p_update_display_name: changes.displayName !== undefined,
      p_update_avatar_url: changes.avatarUrl !== undefined,
    }).single();
  }
}

export class SupabaseProfileAvatarStorage implements ProfileAvatarStorage {
  constructor(private readonly client: SupabaseClient) {}
  async upload(userId: string, avatar: { readonly bytes: Uint8Array; readonly contentType: string }): Promise<string> {
    const extension = avatar.contentType === "image/png" ? "png" : avatar.contentType === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await this.client.storage.from("avatars").upload(path, avatar.bytes, { contentType: avatar.contentType, upsert: false });
    if (error) throw new ProfileFailure("PROFILE_AVATAR_UNAVAILABLE", "No se pudo guardar el avatar.", { cause: error });
    return this.client.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }
  async deleteByPublicUrl(userId: string, publicUrl: string): Promise<void> {
    const marker = "/storage/v1/object/public/avatars/";
    const path = decodeURIComponent(new URL(publicUrl).pathname.split(marker)[1] ?? "");
    if (!path.startsWith(`${userId}/`)) return;
    const { error } = await this.client.storage.from("avatars").remove([path]);
    if (error) throw new ProfileFailure("PROFILE_AVATAR_UNAVAILABLE", "No se pudo eliminar el avatar.", { cause: error });
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

export function createSupabaseProfileAdapters(configuration: SupabaseProfileConfiguration): { readonly profiles: SupabaseProfileDetailsReader; readonly avatars: SupabaseProfileAvatarStorage } {
  const client: SupabaseClient = createClient(configuration.url, configuration.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${configuration.accessToken}` } },
  });
  return { profiles: new SupabaseProfileDetailsReader(new SupabaseProfileRowSource(client)), avatars: new SupabaseProfileAvatarStorage(client) };
}
