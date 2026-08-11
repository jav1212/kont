import type { DeviceDescriptor, DeviceEvent, DeviceLifecycleState } from "@kontave/device-contracts";

export const DESKTOP_IPC = {
  getAuthState: "auth:state",
  signIn: "auth:sign-in",
  signOut: "auth:sign-out",
  authStateChanged: "auth:state-changed",
  connectDevice: "devices:connect",
  disconnectDevice: "devices:disconnect",
  getDeviceStatus: "devices:status",
  deviceEvent: "devices:event",
} as const;

export interface DesktopAuthUser {
  readonly id: string;
  readonly email: string | null;
}

export type DesktopAuthState =
  | { readonly status: "loading" }
  | { readonly status: "anonymous" }
  | { readonly status: "authenticated"; readonly user: DesktopAuthUser };

export interface DesktopSignInCommand {
  readonly email: string;
  readonly password: string;
}

export interface DesktopDeviceStatus {
  readonly state: DeviceLifecycleState;
  readonly device?: DeviceDescriptor;
}

export interface KontaveDesktopApi {
  readonly auth: {
    getState(): Promise<DesktopAuthState>;
    signIn(command: DesktopSignInCommand): Promise<DesktopAuthState>;
    signOut(): Promise<DesktopAuthState>;
    subscribe(listener: (state: DesktopAuthState) => void): () => void;
  };
  readonly devices: {
    connect(): Promise<DesktopDeviceStatus>;
    disconnect(): Promise<DesktopDeviceStatus>;
    getStatus(): Promise<DesktopDeviceStatus>;
    subscribe(listener: (event: DeviceEvent) => void): () => void;
  };
}
