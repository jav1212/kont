/** Classifies how a client update is delivered. */
export type ClientUpdateKind = "binary" | "runtime" | "web-deployment";
/** Declares whether a user may defer an available update. */
export type ClientUpdateRequirement = "optional" | "required";
/** Describes the action required to activate a downloaded update. */
export type ClientUpdateApplyMode = "restart" | "reload" | "open-store";
/** Identifies an update lifecycle operation. */
export type ClientUpdateOperation = "check" | "download" | "apply";

/** Portable identity of the client release currently installed. */
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

/** Portable metadata for a release available to the installed client. */
export interface ClientUpdateRelease extends InstalledClientRelease {
  readonly kind: ClientUpdateKind;
  readonly requirement: ClientUpdateRequirement;
  readonly minimumApiVersion: string | null;
  readonly publishedAt: string | null;
  readonly releaseNotes: string | null;
}

/** Capabilities exposed by a platform-specific update provider. */
export interface ClientUpdateCapabilities {
  readonly supportsBackgroundDownload: boolean;
  readonly supportsProgress: boolean;
  readonly applyMode: ClientUpdateApplyMode;
}

/** Stable codes exposed for expected update failures. */
export type ClientUpdateFailureCode =
  | "UPDATE_INVALID"
  | "UPDATE_OPERATION_IN_PROGRESS"
  | "UPDATE_CHECK_FAILED"
  | "UPDATE_DOWNLOAD_FAILED"
  | "UPDATE_APPLY_FAILED"
  | "UPDATE_UNSUPPORTED";

/** Failure information safe to expose across application boundaries. */
export interface ClientUpdatePublicFailure {
  readonly code: ClientUpdateFailureCode;
  readonly operation: ClientUpdateOperation;
  readonly retryable: boolean;
}

/** State-independent fields present in every update snapshot. */
export interface ClientUpdateSnapshotBase {
  readonly installed: InstalledClientRelease;
  readonly capabilities: ClientUpdateCapabilities;
}

/** Complete state machine for the client update lifecycle. */
export type ClientUpdateState =
  | { readonly status: "idle" }
  | { readonly status: "checking" }
  | { readonly status: "up-to-date"; readonly checkedAt: string }
  | { readonly status: "available"; readonly release: ClientUpdateRelease }
  | { readonly status: "downloading"; readonly release: ClientUpdateRelease; readonly progress: number | null }
  | { readonly status: "ready"; readonly release: ClientUpdateRelease }
  | { readonly status: "applying"; readonly release: ClientUpdateRelease }
  | { readonly status: "failed"; readonly release: ClientUpdateRelease | null; readonly failure: ClientUpdatePublicFailure };

/** Immutable observable view of the current update lifecycle. */
export type ClientUpdateSnapshot = ClientUpdateSnapshotBase & ClientUpdateState;
