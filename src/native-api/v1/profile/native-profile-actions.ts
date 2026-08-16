import { DeleteCurrentProfileAvatar, GetCurrentProfile, UpdateCurrentProfile, UploadCurrentProfileAvatar } from "@kontave/profile-application";
import { createSupabaseProfileAdapters } from "@kontave/profile-supabase";

export function createNativeProfileActions(accessToken: string): {
  readonly getCurrentProfile: GetCurrentProfile;
  readonly updateCurrentProfile: UpdateCurrentProfile;
  readonly uploadAvatar: UploadCurrentProfileAvatar;
  readonly deleteAvatar: DeleteCurrentProfileAvatar;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Native profile access is not configured.");

  const { profiles, avatars } = createSupabaseProfileAdapters({ url, anonKey, accessToken });
  return { getCurrentProfile: new GetCurrentProfile(profiles), updateCurrentProfile: new UpdateCurrentProfile(profiles), uploadAvatar: new UploadCurrentProfileAvatar(profiles, avatars), deleteAvatar: new DeleteCurrentProfileAvatar(profiles, avatars) };
}
