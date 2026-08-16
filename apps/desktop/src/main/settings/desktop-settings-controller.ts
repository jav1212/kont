import { NativeApiClient, NativeApiFailure } from "@kontave/native-api-client";
import type {
  NativeAuthenticatedDeviceSessionDto,
  NativeBillingOverviewDto,
  NativeBillingPlanDto,
  NativeCurrentUserDto,
  NativeManualPaymentRequestDto,
  NativeOrganizationDto,
  NativeOrganizationMemberDto,
  NativeRoleDto,
  NativeUpdateCurrentUserDto,
  NativeUpdateOrganizationDto,
  NativeUpdateUserPreferencesDto,
  NativeUserPreferencesDto,
} from "@kontave/native-api-contracts";
import type { DesktopSettingsResult, DesktopSettingsSnapshot } from "../../shared/desktop-api.js";
import type { DesktopAuthenticatedRequest } from "../auth/desktop-authenticated-request.js";

export class DesktopSettingsController {
  private readonly client: NativeApiClient;
  private readonly snapshotsInFlight = new Map<string, Promise<DesktopSettingsResult<DesktopSettingsSnapshot>>>();

  constructor(baseUrl: string, authenticatedRequest: DesktopAuthenticatedRequest) {
    this.client = new NativeApiClient({
      baseUrl,
      client: "desktop",
      authenticatedFetch: (input, init) => authenticatedRequest.fetch(input, init),
    });
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
        this.client.get<NativeCurrentUserDto>("/api/native/v1/me"),
        this.client.get<NativeUserPreferencesDto>("/api/native/v1/me/preferences"),
        this.client.get<readonly NativeAuthenticatedDeviceSessionDto[]>("/api/native/v1/auth/sessions"),
      ]);
      if (!organizationId) return success({ profile, preferences, organization: null, sessions, members: [], roles: [], billing: null, billingPlans: [], paymentRequests: [], documents: [] });
      const root = `/api/native/v1/organizations/${encodeURIComponent(organizationId)}`;
      const [organization, members, roles, billing, billingPlans, paymentRequests] = await Promise.all([
        this.client.get<NativeOrganizationDto>(root),
        this.optional(`${root}/members`, [] as readonly NativeOrganizationMemberDto[]),
        this.optional(`${root}/roles`, [] as readonly NativeRoleDto[]),
        this.optional<NativeBillingOverviewDto | null>(`${root}/billing/overview`, null),
        this.optional(`${root}/billing/plans`, [] as readonly NativeBillingPlanDto[]),
        this.optional(`${root}/billing/payment-requests`, [] as readonly NativeManualPaymentRequestDto[]),
      ]);
      return success({ profile, preferences, organization, sessions, members, roles, billing, billingPlans, paymentRequests, documents: [] });
    } catch (cause: unknown) { return failure(cause); }
  }

  private async optional<T>(path: string, fallback: T): Promise<T> {
    try { return await this.client.get<T>(path); }
    catch (cause: unknown) {
      if (cause instanceof NativeApiFailure && isCapabilityUnavailable(cause.code)) return fallback;
      throw cause;
    }
  }

  updateProfile(command: unknown): Promise<DesktopSettingsResult<NativeCurrentUserDto>> {
    return this.mutate("/api/native/v1/me", "PATCH", command as NativeUpdateCurrentUserDto);
  }
  updatePreferences(command: unknown): Promise<DesktopSettingsResult<NativeUserPreferencesDto>> {
    return this.mutate("/api/native/v1/me/preferences", "PATCH", command as NativeUpdateUserPreferencesDto);
  }
  updateOrganization(organizationId: unknown, command: unknown): Promise<DesktopSettingsResult<NativeOrganizationDto>> {
    if (typeof organizationId !== "string" || !organizationId) return Promise.resolve(invalid("La organización no es válida."));
    return this.mutate(`/api/native/v1/organizations/${encodeURIComponent(organizationId)}`, "PATCH", command as NativeUpdateOrganizationDto);
  }
  changePassword(newPassword: unknown, revokeOtherSessions: unknown): Promise<DesktopSettingsResult<{ readonly changed: boolean }>> {
    if (typeof newPassword !== "string") return Promise.resolve(invalid("La contraseña no es válida."));
    return this.mutate("/api/native/v1/auth/change-password", "POST", { newPassword, revokeOtherSessions: revokeOtherSessions === true });
  }
  revokeSession(sessionId: unknown): Promise<DesktopSettingsResult<{ readonly revoked: boolean }>> {
    if (typeof sessionId !== "string" || !sessionId) return Promise.resolve(invalid("La sesión no es válida."));
    return this.mutate(`/api/native/v1/auth/sessions/${encodeURIComponent(sessionId)}`, "DELETE");
  }
  revokeOtherSessions(): Promise<DesktopSettingsResult<{ readonly revoked: boolean }>> {
    return this.mutate("/api/native/v1/auth/sessions", "DELETE");
  }

  private async mutate<T>(path: string, method: "PATCH" | "POST" | "DELETE", body?: unknown): Promise<DesktopSettingsResult<T>> {
    try {
      const init: RequestInit = body === undefined
        ? { method }
        : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
      const value = await this.client.request<T>(path, init);
      return success(value);
    } catch (cause: unknown) { return failure(cause); }
  }
}

function success<T>(value: T): DesktopSettingsResult<T> { return { ok: true, value }; }
function invalid<T>(message: string): DesktopSettingsResult<T> { return { ok: false, error: { code: "INVALID_REQUEST", message, requestId: null } }; }
function failure<T>(cause: unknown): DesktopSettingsResult<T> {
  if (cause instanceof NativeApiFailure) return { ok: false, error: { code: cause.code, message: cause.message, requestId: cause.requestId } };
  return { ok: false, error: { code: "UNEXPECTED", message: "No se pudo completar la operación.", requestId: null } };
}

function isCapabilityUnavailable(code: string): boolean {
  return code.endsWith("_ACCESS_DENIED") || code === "DOCUMENT_NOT_FOUND" || code === "DOCUMENT_REPOSITORY_UNAVAILABLE"
    || code === "DOCUMENT_STORAGE_UNAVAILABLE" || code === "MODULE_NOT_ACTIVE" || code === "MODULE_NOT_ENTITLED";
}
