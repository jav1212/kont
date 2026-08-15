import type { AuthenticationFailureCode } from "@kontave/auth-domain";
import type { DeviceDescriptor, DeviceEvent, DeviceLifecycleState } from "@kontave/device-contracts";
import type { ClientUpdateSnapshot } from "@kontave/client-updates-contracts";
import type { ConnectivitySnapshot } from "@kontave/client-connectivity-contracts";

export const DESKTOP_IPC = {
  getAuthState: "auth:state",
  signIn: "auth:sign-in",
  register: "auth:register",
  verifyRegistration: "auth:verify-registration",
  resendRegistration: "auth:resend-registration",
  requestPasswordRecovery: "auth:request-password-recovery",
  verifyPasswordRecovery: "auth:verify-password-recovery",
  completePasswordRecovery: "auth:complete-password-recovery",
  signOut: "auth:sign-out",
  authStateChanged: "auth:state-changed",
  connectDevice: "devices:connect",
  disconnectDevice: "devices:disconnect",
  getDeviceStatus: "devices:status",
  deviceEvent: "devices:event",
  getUpdateState: "updates:state",
  checkForUpdate: "updates:check",
  downloadUpdate: "updates:download",
  applyUpdate: "updates:apply",
  updateStateChanged: "updates:state-changed",
  getWorkspaceState: "workspace:state",
  selectWorkspace: "workspace:select",
  workspaceStateChanged: "workspace:state-changed",
  getCurrentUser: "profile:current",
  currentUserChanged: "profile:current-changed",
  getBillingPlan: "billing:plan",
  billingPlanChanged: "billing:plan-changed",
  getPlatformStatus: "platform:status",
  platformStatusChanged: "platform:status-changed",
  openExternalDestination: "navigation:open-external",
  getConnectivitySnapshot: "connectivity:snapshot",
  refreshConnectivity: "connectivity:refresh",
  connectivityChanged: "connectivity:changed",
} as const;

export interface DesktopAuthUser {
  readonly id: string;
  readonly email: string | null;
}

export type DesktopCurrentUserState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | {
    readonly status: "ready";
    readonly user: {
      readonly userId: string;
      readonly email: string | null;
      readonly displayName: string | null;
      readonly avatarUrl: string | null;
    };
  };

export type DesktopExternalDestination = "settings" | "profile" | "help" | "billing" | "status";

export type DesktopBillingPlanState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | { readonly status: "ready"; readonly organizationId: string; readonly planName: string | null };

export type DesktopPlatformStatusState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | {
    readonly status: "ready";
    readonly availability: "operational" | "degraded" | "down" | "unknown";
    readonly observedAt: string | null;
  };

export type DesktopExternalNavigationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: { readonly message: string } };

export type DesktopAuthState =
  | { readonly status: "loading" }
  | { readonly status: "anonymous" }
  | { readonly status: "authenticated"; readonly user: DesktopAuthUser };

export interface DesktopAuthError {
  readonly code: AuthenticationFailureCode | "UNEXPECTED";
  readonly message: string;
}

export type DesktopAuthResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DesktopAuthError };

export interface DesktopEmailPasswordCommand {
  readonly email: string;
  readonly password: string;
}

export interface DesktopEmailCodeCommand {
  readonly email: string;
  readonly code: string;
}

export interface DesktopEmailCommand {
  readonly email: string;
}

export interface DesktopPasswordCommand {
  readonly password: string;
}

export interface DesktopPendingEmail {
  readonly email: string;
}

export interface DesktopDeviceStatus {
  readonly state: DeviceLifecycleState;
  readonly device?: DeviceDescriptor;
}

export interface DesktopWorkspaceEntry {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly access: "direct" | "delegated";
  readonly scopes: readonly string[];
}

export type DesktopWorkspaceState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | {
    readonly status: "ready";
    readonly workspaces: readonly DesktopWorkspaceEntry[];
    readonly activeWorkspaceId: string | null;
  };

export type DesktopWorkspaceResult =
  | { readonly ok: true; readonly value: DesktopWorkspaceState }
  | { readonly ok: false; readonly error: { readonly message: string } };

export interface KontaveDesktopApi {
  readonly auth: {
    getState(): Promise<DesktopAuthState>;
    signIn(command: DesktopEmailPasswordCommand): Promise<DesktopAuthResult<DesktopAuthState>>;
    register(command: DesktopEmailPasswordCommand): Promise<DesktopAuthResult<DesktopPendingEmail>>;
    verifyRegistration(command: DesktopEmailCodeCommand): Promise<DesktopAuthResult<DesktopAuthState>>;
    resendRegistration(command: DesktopEmailCommand): Promise<DesktopAuthResult<null>>;
    requestPasswordRecovery(command: DesktopEmailCommand): Promise<DesktopAuthResult<DesktopPendingEmail>>;
    verifyPasswordRecovery(command: DesktopEmailCodeCommand): Promise<DesktopAuthResult<DesktopPendingEmail>>;
    completePasswordRecovery(command: DesktopPasswordCommand): Promise<DesktopAuthResult<DesktopAuthState>>;
    signOut(): Promise<DesktopAuthResult<DesktopAuthState>>;
    subscribe(listener: (state: DesktopAuthState) => void): () => void;
  };
  readonly devices: {
    connect(): Promise<DesktopDeviceStatus>;
    disconnect(): Promise<DesktopDeviceStatus>;
    getStatus(): Promise<DesktopDeviceStatus>;
    subscribe(listener: (event: DeviceEvent) => void): () => void;
  };
  readonly updates: {
    getState(): Promise<ClientUpdateSnapshot>;
    check(): Promise<ClientUpdateSnapshot>;
    download(): Promise<ClientUpdateSnapshot>;
    apply(): Promise<ClientUpdateSnapshot>;
    subscribe(listener: (state: ClientUpdateSnapshot) => void): () => void;
  };
  readonly workspace: {
    getState(): Promise<DesktopWorkspaceState>;
    select(workspaceId: string): Promise<DesktopWorkspaceResult>;
    subscribe(listener: (state: DesktopWorkspaceState) => void): () => void;
  };
  readonly profile: {
    getCurrent(): Promise<DesktopCurrentUserState>;
    subscribe(listener: (state: DesktopCurrentUserState) => void): () => void;
  };
  readonly billing: {
    getPlan(): Promise<DesktopBillingPlanState>;
    subscribe(listener: (state: DesktopBillingPlanState) => void): () => void;
  };
  readonly platformStatus: {
    getCurrent(): Promise<DesktopPlatformStatusState>;
    subscribe(listener: (state: DesktopPlatformStatusState) => void): () => void;
  };
  readonly navigation: {
    openExternal(destination: DesktopExternalDestination): Promise<DesktopExternalNavigationResult>;
  };
  readonly connectivity: {
    getSnapshot(): Promise<ConnectivitySnapshot>;
    refresh(): Promise<ConnectivitySnapshot>;
    subscribe(listener: (snapshot: ConnectivitySnapshot) => void): () => void;
  };
}
