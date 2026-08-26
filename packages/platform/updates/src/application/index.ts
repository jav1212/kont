import type {
  ClientUpdateCapabilities,
  ClientUpdateFailureCode,
  ClientUpdateOperation,
  ClientUpdateRelease,
  ClientUpdateSnapshot,
  ClientUpdateState,
  InstalledClientRelease,
} from "@kontave/client-updates/contracts";

/** Result returned by a platform provider after checking for updates. */
export type ClientUpdateCheckResult =
  | { readonly status: "up-to-date"; readonly checkedAt: string }
  | { readonly status: "available"; readonly release: ClientUpdateRelease };

/** Port implemented by each platform-specific update mechanism. */
export interface ClientUpdateProvider {
  readonly installed: InstalledClientRelease;
  readonly capabilities: ClientUpdateCapabilities;
  /**
   * Checks the configured release source for an applicable update.
   * @returns The latest release status for the installed client.
   * @throws A provider-specific failure when the release source cannot be queried.
   */
  check(): Promise<ClientUpdateCheckResult>;
  /**
   * Downloads an applicable release and reports normalized progress.
   * @param release - Validated release selected by the coordinator.
   * @param onProgress - Callback receiving values from zero through one.
   * @returns A promise that resolves when the release is locally ready.
   * @throws A provider-specific failure when the update cannot be downloaded.
   */
  download(release: ClientUpdateRelease, onProgress: (progress: number) => void): Promise<void>;
  /**
   * Activates a previously downloaded release.
   * @param release - Release that is ready to be activated.
   * @returns A promise that resolves after the platform accepts the activation request.
   * @throws A provider-specific failure when the release cannot be applied.
   */
  apply(release: ClientUpdateRelease): Promise<void>;
}

/** Policy that validates whether a release applies to an installed client. */
export interface ClientUpdatePolicy {
  /**
   * Evaluates and normalizes a candidate release.
   * @param installed - Identity of the currently installed release.
   * @param release - Candidate release returned by the provider.
   * @returns An immutable applicable release.
   * @throws {ClientUpdateFailure} When the release is invalid or targets another client.
   */
  evaluate(installed: InstalledClientRelease, release: ClientUpdateRelease): ClientUpdateRelease;
}

/** Observability port for recording private update failure details. */
export interface ClientUpdateFailureObserver {
  /**
   * Records a provider or policy failure without exposing its private cause publicly.
   * @param operation - Operation that failed.
   * @param cause - Original private failure value.
   * @param code - Stable public classification assigned to the failure.
   * @returns Nothing.
   */
  record(operation: ClientUpdateOperation, cause: unknown, code: ClientUpdateFailureCode): void;
}

/** Expected typed failure produced by the update capability. */
export class ClientUpdateFailure extends Error {
  /**
   * Creates a stable update failure.
   * @param code - Machine-readable failure classification.
   * @param message - Diagnostic description intended for trusted callers.
   * @param retryable - Whether retrying the same operation may succeed.
   * @param options - Optional standard error options, including a private cause.
   */
  constructor(
    readonly code: ClientUpdateFailureCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ClientUpdateFailure";
  }
}

/** Default policy enforcing product, platform, architecture, and channel targeting. */
export class DeclaredClientUpdatePolicy implements ClientUpdatePolicy {
  /** {@inheritDoc ClientUpdatePolicy.evaluate} */
  evaluate(installed: InstalledClientRelease, release: ClientUpdateRelease): ClientUpdateRelease {
    validateInstalledRelease(installed);
    validateRelease(release);
    if (release.product !== installed.product || release.platform !== installed.platform || release.architecture !== installed.architecture) {
      throw new ClientUpdateFailure("UPDATE_INVALID", "Update release does not target the installed client.", false);
    }
    if (release.channel !== installed.channel) {
      throw new ClientUpdateFailure("UPDATE_INVALID", "Update release does not target the installed channel.", false);
    }
    return Object.freeze({ ...release });
  }
}

type ClientUpdateListener = () => void;

/** Coordinates the portable update state machine around a platform provider. */
export class ClientUpdateCoordinator {
  private readonly listeners = new Set<ClientUpdateListener>();
  private snapshot: ClientUpdateSnapshot;
  private operationInProgress = false;

  /**
   * Creates an update coordinator with an immutable initial snapshot.
   * @param provider - Platform adapter that performs update operations.
   * @param policy - Policy used to validate candidate releases.
   * @param failureObserver - Optional observer receiving private failure causes.
   * @throws {ClientUpdateFailure} When the installed release metadata is invalid.
   */
  constructor(
    private readonly provider: ClientUpdateProvider,
    private readonly policy: ClientUpdatePolicy = new DeclaredClientUpdatePolicy(),
    private readonly failureObserver?: ClientUpdateFailureObserver,
  ) {
    validateInstalledRelease(provider.installed);
    this.snapshot = Object.freeze({ status: "idle", installed: provider.installed, capabilities: provider.capabilities });
  }

  /**
   * Returns the current immutable update snapshot.
   * @returns The same snapshot reference until the state changes.
   */
  getSnapshot = (): ClientUpdateSnapshot => this.snapshot;

  /**
   * Subscribes to update state transitions.
   * @param listener - Callback invoked after each published transition.
   * @returns An idempotent function that removes the subscription.
   */
  subscribe = (listener: ClientUpdateListener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /**
   * Checks for an applicable client update.
   * @returns The resulting immutable snapshot, including normalized failures.
   * @throws {ClientUpdateFailure} When another operation is already running.
   */
  async check(): Promise<ClientUpdateSnapshot> {
    return this.run("check", null, async () => {
      this.publish({ status: "checking" });
      const result = await this.provider.check();
      if (result.status === "up-to-date") {
        this.publish({ status: "up-to-date", checkedAt: validInstant(result.checkedAt, "Update checkedAt") });
      } else {
        this.publish({ status: "available", release: this.policy.evaluate(this.provider.installed, result.release) });
      }
    });
  }

  /**
   * Downloads the currently available or retryable failed release.
   * @returns The resulting immutable snapshot after download or failure.
   * @throws {ClientUpdateFailure} When the state cannot download or another operation is running.
   */
  async download(): Promise<ClientUpdateSnapshot> {
    const release = this.releaseFor("download");
    return this.run("download", release, async () => {
      this.publish({ status: "downloading", release, progress: null });
      await this.provider.download(release, (progress) => {
        if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
          throw new ClientUpdateFailure("UPDATE_INVALID", "Update progress must be between zero and one.", false);
        }
        this.publish({ status: "downloading", release, progress });
      });
      this.publish({ status: "ready", release });
    });
  }

  /**
   * Applies the currently ready or retryable failed release.
   * @returns The resulting immutable snapshot after activation or failure.
   * @throws {ClientUpdateFailure} When the state cannot apply or another operation is running.
   */
  async apply(): Promise<ClientUpdateSnapshot> {
    const release = this.releaseFor("apply");
    return this.run("apply", release, async () => {
      this.publish({ status: "applying", release });
      await this.provider.apply(release);
      this.publish({ status: "idle" });
    });
  }

  private async run(operation: ClientUpdateOperation, release: ClientUpdateRelease | null, task: () => Promise<void>): Promise<ClientUpdateSnapshot> {
    if (this.operationInProgress) {
      throw new ClientUpdateFailure("UPDATE_OPERATION_IN_PROGRESS", "Another update operation is already running.", true);
    }
    this.operationInProgress = true;
    try {
      await task();
    } catch (cause: unknown) {
      const failure = normalizeFailure(operation, cause);
      this.failureObserver?.record(operation, cause, failure.code);
      this.publish({ status: "failed", release, failure: { code: failure.code, operation, retryable: failure.retryable } });
    } finally {
      this.operationInProgress = false;
    }
    return this.snapshot;
  }

  private releaseFor(operation: "download" | "apply"): ClientUpdateRelease {
    if (operation === "download" && this.snapshot.status === "available") return this.snapshot.release;
    if (operation === "apply" && this.snapshot.status === "ready") return this.snapshot.release;
    if (this.snapshot.status === "failed" && this.snapshot.failure.operation === operation && this.snapshot.release) return this.snapshot.release;
    throw new ClientUpdateFailure("UPDATE_INVALID", `Cannot ${operation} from update state ${this.snapshot.status}.`, false);
  }

  private publish(state: ClientUpdateState): void {
    this.snapshot = Object.freeze({ ...state, installed: this.provider.installed, capabilities: this.provider.capabilities } as ClientUpdateSnapshot);
    for (const listener of [...this.listeners]) listener();
  }
}

function normalizeFailure(operation: ClientUpdateOperation, cause: unknown): ClientUpdateFailure {
  if (cause instanceof ClientUpdateFailure) return cause;
  const code: ClientUpdateFailureCode = operation === "check"
    ? "UPDATE_CHECK_FAILED"
    : operation === "download"
      ? "UPDATE_DOWNLOAD_FAILED"
      : "UPDATE_APPLY_FAILED";
  return new ClientUpdateFailure(code, `Client update ${operation} failed.`, true, { cause });
}

function validateInstalledRelease(release: InstalledClientRelease): void {
  requiredText(release.product, "Installed product");
  requiredText(release.platform, "Installed platform");
  requiredText(release.architecture, "Installed architecture");
  requiredText(release.channel, "Installed channel");
  requiredText(release.productVersion, "Installed product version");
}

function validateRelease(release: ClientUpdateRelease): void {
  validateInstalledRelease(release);
  if (release.publishedAt !== null) validInstant(release.publishedAt, "Update publishedAt");
  if (release.releaseNotes !== null && release.releaseNotes.trim().length > 10_000) {
    throw new ClientUpdateFailure("UPDATE_INVALID", "Update release notes are invalid.", false);
  }
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) throw new ClientUpdateFailure("UPDATE_INVALID", `${label} is invalid.`, false);
  return normalized;
}

function validInstant(value: string, label: string): string {
  if (!value.trim() || Number.isNaN(Date.parse(value))) throw new ClientUpdateFailure("UPDATE_INVALID", `${label} is invalid.`, false);
  return value;
}
