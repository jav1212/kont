import type { AuthenticatedIdentity } from "@kontave/auth-domain";

export interface ProfileDetails {
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly version: number;
}

export interface ProfileDetailsReader {
  findByUserId(userId: string): Promise<ProfileDetails | null>;
}

export interface ProfileRepository extends ProfileDetailsReader {
  update(userId: string, changes: { readonly displayName?: string | null; readonly avatarUrl?: string | null }, expectedVersion: number): Promise<ProfileDetails>;
}

export interface ProfileAvatarStorage {
  upload(userId: string, avatar: { readonly bytes: Uint8Array; readonly contentType: string }): Promise<string>;
  deleteByPublicUrl(userId: string, publicUrl: string): Promise<void>;
}

export interface CurrentProfile {
  readonly userId: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly version: number;
}

export type ProfileFailureCode = "PROFILE_DATA_INVALID" | "PROFILE_VERSION_CONFLICT" | "PROFILE_REPOSITORY_UNAVAILABLE" | "PROFILE_AVATAR_INVALID" | "PROFILE_AVATAR_UNAVAILABLE";

export class ProfileFailure extends Error {
  constructor(
    readonly code: ProfileFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProfileFailure";
  }
}

/** Composes authentication-owned identity with optional presentation details. */
export class GetCurrentProfile {
  constructor(private readonly profiles: ProfileDetailsReader) {}

  async execute(identity: AuthenticatedIdentity): Promise<CurrentProfile> {
    const details = await this.profiles.findByUserId(identity.userId);
    return {
      userId: identity.userId,
      email: identity.email,
      displayName: details?.displayName ?? null,
      avatarUrl: details?.avatarUrl ?? null,
      version: details?.version ?? 0,
    };
  }
}

export class UpdateCurrentProfile {
  constructor(private readonly profiles: ProfileRepository) {}
  async execute(command: { readonly userId: string; readonly displayName?: string; readonly expectedVersion: number }): Promise<ProfileDetails> {
    const displayName = command.displayName?.trim();
    if (displayName !== undefined && (displayName.length < 1 || displayName.length > 120)) throw new ProfileFailure("PROFILE_DATA_INVALID", "El nombre debe contener entre 1 y 120 caracteres.");
    return this.profiles.update(command.userId, displayName === undefined ? {} : { displayName }, command.expectedVersion);
  }
}

export class UploadCurrentProfileAvatar {
  constructor(private readonly profiles: ProfileRepository, private readonly storage: ProfileAvatarStorage) {}
  async execute(command: { readonly userId: string; readonly avatar: { readonly bytes: Uint8Array; readonly contentType: string }; readonly expectedVersion: number }): Promise<ProfileDetails> {
    if (!ALLOWED_AVATAR_TYPES.has(command.avatar.contentType) || command.avatar.bytes.byteLength === 0 || command.avatar.bytes.byteLength > 5_000_000) {
      throw new ProfileFailure("PROFILE_AVATAR_INVALID", "El avatar debe ser una imagen PNG, JPEG o WebP de hasta 5 MB.");
    }
    const current = await this.profiles.findByUserId(command.userId);
    if ((current?.version ?? 0) !== command.expectedVersion) throw new ProfileFailure("PROFILE_VERSION_CONFLICT", "El perfil cambió en otro cliente.");
    const avatarUrl = await this.storage.upload(command.userId, command.avatar);
    try {
      const updated = await this.profiles.update(command.userId, { avatarUrl }, command.expectedVersion);
      if (current?.avatarUrl) await this.storage.deleteByPublicUrl(command.userId, current.avatarUrl).catch(() => undefined);
      return updated;
    } catch (cause) {
      await this.storage.deleteByPublicUrl(command.userId, avatarUrl).catch(() => undefined);
      throw cause;
    }
  }
}

export class DeleteCurrentProfileAvatar {
  constructor(private readonly profiles: ProfileRepository, private readonly storage: ProfileAvatarStorage) {}
  async execute(command: { readonly userId: string; readonly expectedVersion: number }): Promise<ProfileDetails> {
    const current = await this.profiles.findByUserId(command.userId);
    if (!current) throw new ProfileFailure("PROFILE_REPOSITORY_UNAVAILABLE", "El perfil no existe.");
    const updated = await this.profiles.update(command.userId, { avatarUrl: null }, command.expectedVersion);
    if (current.avatarUrl) await this.storage.deleteByPublicUrl(command.userId, current.avatarUrl).catch(() => undefined);
    return updated;
  }
}

const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
