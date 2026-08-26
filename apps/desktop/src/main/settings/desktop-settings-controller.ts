import type {
  AuthenticationPort,
  BillingOverviewDto,
  BillingPlanDto,
  BillingPort,
  ClientPortFeature,
  CurrentUserDto,
  ManualPaymentRequestDto,
  OrganizationDto,
  OrganizationMemberDto,
  OrganizationsPort,
  ProfilePort,
  RoleDto,
  UpdateCurrentUserDto,
  UpdateOrganizationDto,
  UpdateUserPreferencesDto,
  UserPreferencesDto,
} from "@kontave/client-contracts";
import type {
  DesktopSettingsResult,
  DesktopSettingsSnapshot,
} from "../../renderer-bridge";
import {
  ClientOperationFailure,
  findClientOperationFailure,
  requireClientValue,
} from "../client/client-operation";

export class DesktopSettingsController {
  private readonly snapshotsInFlight = new Map<
    string,
    Promise<DesktopSettingsResult<DesktopSettingsSnapshot>>
  >();

  constructor(
    private readonly authentication: ClientPortFeature<AuthenticationPort>,
    private readonly billing: ClientPortFeature<BillingPort>,
    private readonly organizations: ClientPortFeature<OrganizationsPort>,
    private readonly profile: ClientPortFeature<ProfilePort>,
  ) {}

  getSnapshot(
    organizationId: unknown,
    companyId: unknown,
  ): Promise<DesktopSettingsResult<DesktopSettingsSnapshot>> {
    if (organizationId !== null && typeof organizationId !== "string")
      return Promise.resolve(invalid("La organización no es válida."));
    if (companyId !== null && typeof companyId !== "string")
      return Promise.resolve(invalid("La empresa no es válida."));
    const key = `${organizationId ?? "personal"}:${companyId ?? "organization"}`;
    const current = this.snapshotsInFlight.get(key);
    if (current) return current;
    const operation = this.loadSnapshot(organizationId, companyId).finally(() =>
      this.snapshotsInFlight.delete(key),
    );
    this.snapshotsInFlight.set(key, operation);
    return operation;
  }

  private async loadSnapshot(
    organizationId: string | null,
    _companyId: string | null,
  ): Promise<DesktopSettingsResult<DesktopSettingsSnapshot>> {
    try {
      const [profileResult, preferencesResult, sessionsResult] =
        await Promise.all([
          this.profile.current(),
          this.profile.preferences(),
          this.authentication.sessions(),
        ]);
      const profile = requireClientValue(profileResult);
      const preferences = requireClientValue(preferencesResult);
      const sessions = requireClientValue(sessionsResult);
      if (!organizationId)
        return success({
          profile,
          preferences,
          organization: null,
          sessions,
          members: [],
          roles: [],
          billing: null,
          billingPlans: [],
          paymentRequests: [],
          documents: [],
        });
      const [
        organization,
        members,
        roles,
        billing,
        billingPlans,
        paymentRequests,
      ] = await Promise.all([
        this.clientValue(() => this.organizations.get(organizationId)),
        this.optional(
          () =>
            this.clientValue(() => this.organizations.members(organizationId)),
          [] as readonly OrganizationMemberDto[],
        ),
        this.optional(
          () =>
            this.clientValue(() => this.organizations.roles(organizationId)),
          [] as readonly RoleDto[],
        ),
        this.optional<BillingOverviewDto | null>(
          () => this.clientValue(() => this.billing.overview(organizationId)),
          null,
        ),
        this.optional(
          () => this.clientValue(() => this.billing.plans(organizationId)),
          [] as readonly BillingPlanDto[],
        ),
        this.optional(
          () =>
            this.clientValue(() =>
              this.billing.paymentRequests(organizationId),
            ),
          [] as readonly ManualPaymentRequestDto[],
        ),
      ]);
      return success({
        profile,
        preferences,
        organization,
        sessions,
        members,
        roles,
        billing,
        billingPlans,
        paymentRequests,
        documents: [],
      });
    } catch (cause: unknown) {
      return failure(cause);
    }
  }

  private async optional<T>(
    operation: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await operation();
    } catch (cause: unknown) {
      if (
        cause instanceof ClientOperationFailure &&
        isCapabilityUnavailable(cause.code)
      )
        return fallback;
      throw cause;
    }
  }

  private async clientValue<T>(
    operation: () => Promise<
      import("@kontave/client-contracts").ClientOperationResult<T>
    >,
  ): Promise<T> {
    return requireClientValue(await operation());
  }

  updateProfile(
    command: unknown,
  ): Promise<DesktopSettingsResult<CurrentUserDto>> {
    return execute(() =>
      this.clientValue(() =>
        this.profile.update(command as UpdateCurrentUserDto),
      ),
    );
  }
  updatePreferences(
    command: unknown,
  ): Promise<DesktopSettingsResult<UserPreferencesDto>> {
    return execute(() =>
      this.clientValue(() =>
        this.profile.updatePreferences(command as UpdateUserPreferencesDto),
      ),
    );
  }
  updateOrganization(
    organizationId: unknown,
    command: unknown,
  ): Promise<DesktopSettingsResult<OrganizationDto>> {
    if (typeof organizationId !== "string" || !organizationId)
      return Promise.resolve(invalid("La organización no es válida."));
    return execute(() =>
      this.clientValue(() =>
        this.organizations.update(
          organizationId,
          command as UpdateOrganizationDto,
        ),
      ),
    );
  }
  changePassword(
    newPassword: unknown,
    revokeOtherSessions: unknown,
  ): Promise<DesktopSettingsResult<{ readonly changed: boolean }>> {
    if (typeof newPassword !== "string")
      return Promise.resolve(invalid("La contraseña no es válida."));
    return execute(() =>
      this.clientValue(() =>
        this.authentication.changePassword({
          newPassword,
          revokeOtherSessions: revokeOtherSessions === true,
        }),
      ),
    );
  }
  revokeSession(
    sessionId: unknown,
  ): Promise<DesktopSettingsResult<{ readonly revoked: boolean }>> {
    if (typeof sessionId !== "string" || !sessionId)
      return Promise.resolve(invalid("La sesión no es válida."));
    return execute(() =>
      this.clientValue(() => this.authentication.revokeSession(sessionId)),
    );
  }
  revokeOtherSessions(): Promise<
    DesktopSettingsResult<{ readonly revoked: boolean }>
  > {
    return execute(() =>
      this.clientValue(() => this.authentication.revokeOtherSessions()),
    );
  }
}

async function execute<T>(
  operation: () => Promise<T>,
): Promise<DesktopSettingsResult<T>> {
  try {
    return success(await operation());
  } catch (cause: unknown) {
    return failure(cause);
  }
}

function success<T>(value: T): DesktopSettingsResult<T> {
  return { ok: true, value };
}
function invalid<T>(message: string): DesktopSettingsResult<T> {
  return {
    ok: false,
    error: { code: "INVALID_REQUEST", message, requestId: null },
  };
}
function failure<T>(cause: unknown): DesktopSettingsResult<T> {
  const clientFailure = findClientOperationFailure(cause);
  if (clientFailure)
    return {
      ok: false,
      error: {
        code: clientFailure.code,
        message: clientFailure.message,
        requestId: clientFailure.requestId,
      },
    };
  return {
    ok: false,
    error: {
      code: "UNEXPECTED",
      message: "No se pudo completar la operación.",
      requestId: null,
    },
  };
}

function isCapabilityUnavailable(code: string): boolean {
  return (
    code.endsWith("_ACCESS_DENIED") ||
    code === "DOCUMENT_NOT_FOUND" ||
    code === "DOCUMENT_REPOSITORY_UNAVAILABLE" ||
    code === "DOCUMENT_STORAGE_UNAVAILABLE" ||
    code === "MODULE_NOT_ACTIVE" ||
    code === "MODULE_NOT_ENTITLED"
  );
}
