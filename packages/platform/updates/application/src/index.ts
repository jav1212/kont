import type {
  ClientUpdateCapabilities,
  ClientUpdateFailureCode,
  ClientUpdateOperation,
  ClientUpdateRelease,
  ClientUpdateSnapshot,
  ClientUpdateState,
  InstalledClientRelease,
} from "@kontave/client-updates-contracts";

export type ClientUpdateCheckResult =
  | { readonly status: "up-to-date"; readonly checkedAt: string }
  | { readonly status: "available"; readonly release: ClientUpdateRelease };

export interface ClientUpdateProvider {
  readonly installed: InstalledClientRelease;
  readonly capabilities: ClientUpdateCapabilities;
  check(): Promise<ClientUpdateCheckResult>;
  download(release: ClientUpdateRelease, onProgress: (progress: number) => void): Promise<void>;
  apply(release: ClientUpdateRelease): Promise<void>;
}

export interface ClientUpdatePolicy {
  evaluate(installed: InstalledClientRelease, release: ClientUpdateRelease): ClientUpdateRelease;
}

export interface ClientUpdateFailureObserver {
  record(operation: ClientUpdateOperation, cause: unknown, code: ClientUpdateFailureCode): void;
}

export class ClientUpdateFailure extends Error {
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

export class DeclaredClientUpdatePolicy implements ClientUpdatePolicy {
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

export class ClientUpdateCoordinator {
  private readonly listeners = new Set<ClientUpdateListener>();
  private snapshot: ClientUpdateSnapshot;
  private operationInProgress = false;

  constructor(
    private readonly provider: ClientUpdateProvider,
    private readonly policy: ClientUpdatePolicy = new DeclaredClientUpdatePolicy(),
    private readonly failureObserver?: ClientUpdateFailureObserver,
  ) {
    validateInstalledRelease(provider.installed);
    this.snapshot = Object.freeze({ status: "idle", installed: provider.installed, capabilities: provider.capabilities });
  }

  getSnapshot = (): ClientUpdateSnapshot => this.snapshot;

  subscribe = (listener: ClientUpdateListener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

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
