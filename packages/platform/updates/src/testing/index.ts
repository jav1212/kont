import type {
  ClientUpdateCheckResult,
  ClientUpdateProvider,
} from "@kontave/client-updates/application";
import type {
  ClientUpdateCapabilities,
  ClientUpdateRelease,
  InstalledClientRelease,
} from "@kontave/client-updates/contracts";

/** Deterministic update provider for application and consumer tests. */
export class FakeClientUpdateProvider implements ClientUpdateProvider {
  readonly downloaded: ClientUpdateRelease[] = [];
  readonly applied: ClientUpdateRelease[] = [];
  readonly progress: number[] = [];
  checkCount = 0;

  /**
   * Creates a configurable in-memory provider.
   * @param installed - Installed release identity exposed to the coordinator.
   * @param capabilities - Platform capabilities exposed to the coordinator.
   * @param checkResult - Initial result returned by update checks.
   */
  constructor(
    readonly installed: InstalledClientRelease,
    readonly capabilities: ClientUpdateCapabilities,
    private checkResult: ClientUpdateCheckResult,
  ) {}

  /**
   * Replaces the result returned by subsequent checks.
   * @param result - New deterministic check result.
   * @returns Nothing.
   */
  setCheckResult(result: ClientUpdateCheckResult): void {
    this.checkResult = result;
  }

  /** {@inheritDoc ClientUpdateProvider.check} */
  async check(): Promise<ClientUpdateCheckResult> {
    this.checkCount += 1;
    return this.checkResult;
  }

  /** {@inheritDoc ClientUpdateProvider.download} */
  async download(release: ClientUpdateRelease, onProgress: (progress: number) => void): Promise<void> {
    this.downloaded.push(release);
    for (const value of this.progress) onProgress(value);
  }

  /** {@inheritDoc ClientUpdateProvider.apply} */
  async apply(release: ClientUpdateRelease): Promise<void> {
    this.applied.push(release);
  }
}
