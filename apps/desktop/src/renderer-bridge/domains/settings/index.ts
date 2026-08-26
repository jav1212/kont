import type {
  AuthenticatedDeviceSessionDto,
  BillingOverviewDto,
  BillingPlanDto,
  CurrentUserDto,
  DocumentDto,
  ManualPaymentRequestDto,
  OrganizationDto,
  OrganizationMemberDto,
  RoleDto,
  UpdateCurrentUserDto,
  UpdateOrganizationDto,
  UpdateUserPreferencesDto,
  UserPreferencesDto,
} from "@kontave/client-contracts";
import type { DesktopResult } from "../../core/result";

/** Settings data loaded atomically for the active operational context. */
export interface DesktopSettingsSnapshot {
  readonly profile: CurrentUserDto;
  readonly preferences: UserPreferencesDto;
  readonly organization: OrganizationDto | null;
  readonly sessions: readonly AuthenticatedDeviceSessionDto[];
  readonly members: readonly OrganizationMemberDto[];
  readonly roles: readonly RoleDto[];
  readonly billing: BillingOverviewDto | null;
  readonly billingPlans: readonly BillingPlanDto[];
  readonly paymentRequests: readonly ManualPaymentRequestDto[];
  readonly documents: readonly DocumentDto[];
}

export type DesktopSettingsResult<T> = DesktopResult<T>;

/** Settings capability exposed by preload. */
export interface DesktopSettingsApi {
  getSnapshot(
    organizationId: string | null,
    companyId: string | null,
  ): Promise<DesktopSettingsResult<DesktopSettingsSnapshot>>;
  updateProfile(
    command: UpdateCurrentUserDto,
  ): Promise<DesktopSettingsResult<CurrentUserDto>>;
  updatePreferences(
    command: UpdateUserPreferencesDto,
  ): Promise<DesktopSettingsResult<UserPreferencesDto>>;
  updateOrganization(
    organizationId: string,
    command: UpdateOrganizationDto,
  ): Promise<DesktopSettingsResult<OrganizationDto>>;
  changePassword(
    newPassword: string,
    revokeOtherSessions: boolean,
  ): Promise<DesktopSettingsResult<{ readonly changed: boolean }>>;
  revokeSession(
    sessionId: string,
  ): Promise<DesktopSettingsResult<{ readonly revoked: boolean }>>;
  revokeOtherSessions(): Promise<
    DesktopSettingsResult<{ readonly revoked: boolean }>
  >;
}
