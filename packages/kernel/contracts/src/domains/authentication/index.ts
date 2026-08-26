export interface AuthenticatedUserDto {
  readonly id: string;
  readonly email: string | null;
}

export interface SessionDto {
  readonly user: AuthenticatedUserDto;
}
export interface AuthenticatedDeviceSessionDto {
  readonly id: string;
  readonly client: "web" | "desktop" | "mobile";
  readonly deviceName: string | null;
  readonly operatingSystem: string | null;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly current: boolean;
}
export interface ChangePasswordDto {
  readonly newPassword: string;
  readonly revokeOtherSessions?: boolean;
}

/** Application-facing port for authenticated device-session administration. */
export interface AuthenticationPort {
  /** @returns All device sessions belonging to the current user. */
  sessions(): Promise<readonly AuthenticatedDeviceSessionDto[]>;
  /** @param command - Password change request. @returns Change confirmation. */
  changePassword(
    command: ChangePasswordDto,
  ): Promise<{ readonly changed: boolean }>;
  /** @param sessionId - Session to revoke. @returns Revocation confirmation. */
  revokeSession(sessionId: string): Promise<{ readonly revoked: boolean }>;
  /** @returns Confirmation after revoking every other session. */
  revokeOtherSessions(): Promise<{ readonly revoked: boolean }>;
}
