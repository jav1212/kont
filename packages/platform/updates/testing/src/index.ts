import type {
  ClientUpdateCheckResult,
  ClientUpdateProvider,
} from "@kontave/client-updates-application";
import type {
  ClientUpdateCapabilities,
  ClientUpdateRelease,
  InstalledClientRelease,
} from "@kontave/client-updates-contracts";

export class FakeClientUpdateProvider implements ClientUpdateProvider {
  readonly downloaded: ClientUpdateRelease[] = [];
  readonly applied: ClientUpdateRelease[] = [];
  readonly progress: number[] = [];
  checkCount = 0;

  constructor(
    readonly installed: InstalledClientRelease,
    readonly capabilities: ClientUpdateCapabilities,
    private checkResult: ClientUpdateCheckResult,
  ) {}

  setCheckResult(result: ClientUpdateCheckResult): void {
    this.checkResult = result;
  }

  async check(): Promise<ClientUpdateCheckResult> {
    this.checkCount += 1;
    return this.checkResult;
  }

  async download(release: ClientUpdateRelease, onProgress: (progress: number) => void): Promise<void> {
    this.downloaded.push(release);
    for (const value of this.progress) onProgress(value);
  }

  async apply(release: ClientUpdateRelease): Promise<void> {
    this.applied.push(release);
  }
}
