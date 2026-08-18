export interface CurrentUserDto {
  readonly userId: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly version: number;
}

export interface UpdateCurrentUserDto {
  readonly displayName?: string;
  readonly expectedVersion: number;
}

export interface UserPreferencesDto {
  readonly appearance: {
    readonly colorScheme: "light" | "dark" | "system";
    readonly density: "comfortable" | "compact";
  };
  readonly regional: { readonly locale: string; readonly timeZone: string };
  readonly version: number;
  readonly updatedAt: string;
}

export interface UpdateUserPreferencesDto {
  readonly expectedVersion: number;
  readonly appearance?: Partial<UserPreferencesDto["appearance"]>;
  readonly regional?: Partial<UserPreferencesDto["regional"]>;
}

/** Application-facing port for the current user's profile and preferences. */
export interface ProfilePort {
  /** @returns Current user profile. */
  current(): Promise<CurrentUserDto>;
  /** @returns Current user preferences. */
  preferences(): Promise<UserPreferencesDto>;
  /** @param command - Versioned profile changes. @returns Updated profile. */
  update(command: UpdateCurrentUserDto): Promise<CurrentUserDto>;
  /** @param command - Versioned preference changes. @returns Updated preferences. */
  updatePreferences(command: UpdateUserPreferencesDto): Promise<UserPreferencesDto>;
}
