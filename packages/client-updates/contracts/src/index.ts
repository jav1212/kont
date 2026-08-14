export type ClientUpdateKind = "binary" | "runtime" | "web-deployment";
export type ClientUpdateRequirement = "optional" | "required";
export type ClientUpdateApplyMode = "restart" | "reload" | "open-store";
export type ClientUpdateOperation = "check" | "download" | "apply";

export interface InstalledClientRelease {
  readonly product: string;
  readonly platform: string;
  readonly architecture: string;
  readonly channel: string;
  readonly productVersion: string;
  readonly buildNumber: string | null;
  readonly runtimeVersion: string | null;
  readonly apiVersion: string | null;
}

export interface ClientUpdateRelease extends InstalledClientRelease {
  readonly kind: ClientUpdateKind;
  readonly requirement: ClientUpdateRequirement;
  readonly minimumApiVersion: string | null;
  readonly publishedAt: string | null;
  readonly releaseNotes: string | null;
}

export interface ClientUpdateCapabilities {
  readonly supportsBackgroundDownload: boolean;
  readonly supportsProgress: boolean;
  readonly applyMode: ClientUpdateApplyMode;
}

export type ClientUpdateFailureCode =
  | "UPDATE_INVALID"
  | "UPDATE_OPERATION_IN_PROGRESS"
  | "UPDATE_CHECK_FAILED"
  | "UPDATE_DOWNLOAD_FAILED"
  | "UPDATE_APPLY_FAILED"
  | "UPDATE_UNSUPPORTED";

export interface ClientUpdatePublicFailure {
  readonly code: ClientUpdateFailureCode;
  readonly operation: ClientUpdateOperation;
  readonly retryable: boolean;
}

export interface ClientUpdateSnapshotBase {
  readonly installed: InstalledClientRelease;
  readonly capabilities: ClientUpdateCapabilities;
}

export type ClientUpdateState =
  | { readonly status: "idle" }
  | { readonly status: "checking" }
  | { readonly status: "up-to-date"; readonly checkedAt: string }
  | { readonly status: "available"; readonly release: ClientUpdateRelease }
  | { readonly status: "downloading"; readonly release: ClientUpdateRelease; readonly progress: number | null }
  | { readonly status: "ready"; readonly release: ClientUpdateRelease }
  | { readonly status: "applying"; readonly release: ClientUpdateRelease }
  | { readonly status: "failed"; readonly release: ClientUpdateRelease | null; readonly failure: ClientUpdatePublicFailure };

export type ClientUpdateSnapshot = ClientUpdateSnapshotBase & ClientUpdateState;
