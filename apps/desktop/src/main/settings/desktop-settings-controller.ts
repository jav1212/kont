import {
  KontaveRemoteClient,
  KontaveRemoteFailure,
  RemoteAuthenticationPort,
  RemoteBillingPort,
  RemoteOrganizationsPort,
  RemoteProfilePort,
} from "@kontave/client-remote";
import type {
  BillingOverviewDto,
  BillingPlanDto,
  CurrentUserDto,
  ManualPaymentRequestDto,
  OrganizationDto,
  OrganizationMemberDto,
  RoleDto,
  UpdateCurrentUserDto,
  UpdateOrganizationDto,
  UpdateUserPreferencesDto,
  UserPreferencesDto,
} from "@kontave/client-contracts";
import type { DesktopSettingsResult, DesktopSettingsSnapshot } from "../../shared/desktop-api";
import type { DesktopAuthenticatedRequest } from "../auth/desktop-authenticated-request";

export class DesktopSettingsController {
  private readonly authentication: RemoteAuthenticationPort;
  private readonly billing: RemoteBillingPort;
  private readonly organizations: RemoteOrganizationsPort;
  private readonly profile: RemoteProfilePort;
  private readonly snapshotsInFlight = new Map<string, Promise<DesktopSettingsResult<DesktopSettingsSnapshot>>>();

  constructor(baseUrl: string, authenticatedRequest: DesktopAuthenticatedRequest) {
    const transport = new KontaveRemoteClient({
      baseUrl,
      platform: "desktop",
      authenticatedRequest: (input, init) => authenticatedRequest.fetch(input, init),
    });
    this.authentication = new RemoteAuthenticationPort(transport);
    this.billing = new RemoteBillingPort(transport);
    this.organizations = new RemoteOrganizationsPort(transport);
    this.profile = new RemoteProfilePort(transport);
  }

  getSnapshot(organizationId: unknown, companyId: unknown): Promise<DesktopSettingsResult<DesktopSettingsSnapshot>> {
    if (organizationId !== null && typeof organizationId !== "string") return Promise.resolve(invalid("La organización no es válida."));
    if (companyId !== null && typeof companyId !== "string") return Promise.resolve(invalid("La empresa no es válida."));
    const key = `${organizationId ?? "personal"}:${companyId ?? "organization"}`;
    const current = this.snapshotsInFlight.get(key);
    if (current) return current;
    const operation = this.loadSnapshot(organizationId, companyId).finally(() => this.snapshotsInFlight.delete(key));
    this.snapshotsInFlight.set(key, operation);
    return operation;
  }

  private async loadSnapshot(organizationId: string | null, _companyId: string | null): Promise<DesktopSettingsResult<DesktopSettingsSnapshot>> {
    try {
      const [profile, preferences, sessions] = await Promise.all([
        this.profile.current(),
        this.profile.preferences(),
        this.authentication.sessions(),
      ]);
      if (!organizationId) return success({ profile, preferences, organization: null, sessions, members: [], roles: [], billing: null, billingPlans: [], paymentRequests: [], documents: [] });
      const [organization, members, roles, billing, billingPlans, paymentRequests] = await Promise.all([
        this.organizations.get(organizationId),
        this.optional(() => this.organizations.members(organizationId), [] as readonly OrganizationMemberDto[]),
        this.optional(() => this.organizations.roles(organizationId), [] as readonly RoleDto[]),
        this.optional<BillingOverviewDto | null>(() => this.billing.overview(organizationId), null),
        this.optional(() => this.billing.plans(organizationId), [] as readonly BillingPlanDto[]),
        this.optional(() => this.billing.paymentRequests(organizationId), [] as readonly ManualPaymentRequestDto[]),
      ]);
      return success({ profile, preferences, organization, sessions, members, roles, billing, billingPlans, paymentRequests, documents: [] });
    } catch (cause: unknown) { return failure(cause); }
  }

  private async optional<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    try { return await operation(); }
    catch (cause: unknown) {
      if (cause instanceof KontaveRemoteFailure && isCapabilityUnavailable(cause.code)) return fallback;
      throw cause;
    }
  }

  updateProfile(command: unknown): Promise<DesktopSettingsResult<CurrentUserDto>> {
    return execute(() => this.profile.update(command as UpdateCurrentUserDto));
  }
  updatePreferences(command: unknown): Promise<DesktopSettingsResult<UserPreferencesDto>> {
    return execute(() => this.profile.updatePreferences(command as UpdateUserPreferencesDto));
  }
  updateOrganization(organizationId: unknown, command: unknown): Promise<DesktopSettingsResult<OrganizationDto>> {
    if (typeof organizationId !== "string" || !organizationId) return Promise.resolve(invalid("La organización no es válida."));
    return execute(() => this.organizations.update(organizationId, command as UpdateOrganizationDto));
  }
  changePassword(newPassword: unknown, revokeOtherSessions: unknown): Promise<DesktopSettingsResult<{ readonly changed: boolean }>> {
    if (typeof newPassword !== "string") return Promise.resolve(invalid("La contraseña no es válida."));
    return execute(() => this.authentication.changePassword({ newPassword, revokeOtherSessions: revokeOtherSessions === true }));
  }
  revokeSession(sessionId: unknown): Promise<DesktopSettingsResult<{ readonly revoked: boolean }>> {
    if (typeof sessionId !== "string" || !sessionId) return Promise.resolve(invalid("La sesión no es válida."));
    return execute(() => this.authentication.revokeSession(sessionId));
  }
  revokeOtherSessions(): Promise<DesktopSettingsResult<{ readonly revoked: boolean }>> {
    return execute(() => this.authentication.revokeOtherSessions());
  }
}

async function execute<T>(operation: () => Promise<T>): Promise<DesktopSettingsResult<T>> {
  try { return success(await operation()); }
  catch (cause: unknown) { return failure(cause); }
}

function success<T>(value: T): DesktopSettingsResult<T> { return { ok: true, value }; }
function invalid<T>(message: string): DesktopSettingsResult<T> { return { ok: false, error: { code: "INVALID_REQUEST", message, requestId: null } }; }
function failure<T>(cause: unknown): DesktopSettingsResult<T> {
  if (cause instanceof KontaveRemoteFailure) return { ok: false, error: { code: cause.code, message: cause.message, requestId: cause.requestId } };
  return { ok: false, error: { code: "UNEXPECTED", message: "No se pudo completar la operación.", requestId: null } };
}

function isCapabilityUnavailable(code: string): boolean {
  return code.endsWith("_ACCESS_DENIED") || code === "DOCUMENT_NOT_FOUND" || code === "DOCUMENT_REPOSITORY_UNAVAILABLE"
    || code === "DOCUMENT_STORAGE_UNAVAILABLE" || code === "MODULE_NOT_ACTIVE" || code === "MODULE_NOT_ENTITLED";
}
