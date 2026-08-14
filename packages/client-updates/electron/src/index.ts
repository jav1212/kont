import updater from "electron-updater";
import type { ClientUpdateCheckResult, ClientUpdateProvider } from "@kontave/client-updates-application";
import { ClientUpdateFailure } from "@kontave/client-updates-application";
import type {
  ClientUpdateCapabilities,
  ClientUpdateRelease,
  InstalledClientRelease,
} from "@kontave/client-updates-contracts";

interface ElectronUpdateInfo {
  readonly version: string;
  readonly releaseDate?: string;
  readonly releaseName?: string | null;
  readonly releaseNotes?: unknown;
}

interface ElectronUpdateCheckResult {
  readonly updateInfo: ElectronUpdateInfo;
  readonly isUpdateAvailable?: boolean;
}

interface ElectronDownloadProgress {
  readonly percent: number;
}

export interface ElectronUpdaterPort {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<ElectronUpdateCheckResult | null>;
  downloadUpdate(): Promise<readonly string[]>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: "download-progress", listener: (progress: ElectronDownloadProgress) => void): unknown;
  off(event: "download-progress", listener: (progress: ElectronDownloadProgress) => void): unknown;
}

export interface ElectronClientUpdateOptions {
  readonly installed: InstalledClientRelease;
  readonly enabled: boolean;
  readonly defaultRequirement?: "optional" | "required";
}

export function createElectronClientUpdateProvider(options: ElectronClientUpdateOptions): ElectronClientUpdateProvider {
  return new ElectronClientUpdateProvider(updater.autoUpdater, options);
}

export class ElectronClientUpdateProvider implements ClientUpdateProvider {
  readonly installed: InstalledClientRelease;
  readonly capabilities: ClientUpdateCapabilities = Object.freeze({
    supportsBackgroundDownload: true,
    supportsProgress: true,
    applyMode: "restart",
  });

  constructor(private readonly updaterPort: ElectronUpdaterPort, private readonly options: ElectronClientUpdateOptions) {
    this.installed = Object.freeze({ ...options.installed });
    this.updaterPort.autoDownload = false;
    this.updaterPort.autoInstallOnAppQuit = false;
  }

  async check(): Promise<ClientUpdateCheckResult> {
    if (!this.options.enabled) return { status: "up-to-date", checkedAt: new Date().toISOString() };
    const result = await this.updaterPort.checkForUpdates();
    if (!result) return { status: "up-to-date", checkedAt: new Date().toISOString() };
    const available = result.isUpdateAvailable ?? compareVersions(result.updateInfo.version, this.installed.productVersion) > 0;
    if (!available) return { status: "up-to-date", checkedAt: new Date().toISOString() };
    return { status: "available", release: mapRelease(this.installed, result.updateInfo, this.options.defaultRequirement ?? "optional") };
  }

  async download(_release: ClientUpdateRelease, onProgress: (progress: number) => void): Promise<void> {
    if (!this.options.enabled) throw new ClientUpdateFailure("UPDATE_UNSUPPORTED", "Electron updates are disabled for this build.", false);
    const listener = ({ percent }: ElectronDownloadProgress): void => {
      if (Number.isFinite(percent)) onProgress(Math.max(0, Math.min(1, percent / 100)));
    };
    this.updaterPort.on("download-progress", listener);
    try {
      await this.updaterPort.downloadUpdate();
    } finally {
      this.updaterPort.off("download-progress", listener);
    }
  }

  async apply(_release: ClientUpdateRelease): Promise<void> {
    if (!this.options.enabled) throw new ClientUpdateFailure("UPDATE_UNSUPPORTED", "Electron updates are disabled for this build.", false);
    this.updaterPort.quitAndInstall(false, true);
  }
}

function mapRelease(installed: InstalledClientRelease, info: ElectronUpdateInfo, requirement: "optional" | "required"): ClientUpdateRelease {
  return Object.freeze({
    ...installed,
    productVersion: info.version,
    buildNumber: null,
    kind: "binary",
    requirement,
    minimumApiVersion: null,
    publishedAt: validOptionalInstant(info.releaseDate),
    releaseNotes: releaseNotes(info),
  });
}

function releaseNotes(info: ElectronUpdateInfo): string | null {
  if (typeof info.releaseNotes === "string" && info.releaseNotes.trim()) return info.releaseNotes.trim();
  if (typeof info.releaseName === "string" && info.releaseName.trim()) return info.releaseName.trim();
  return null;
}

function validOptionalInstant(value: string | undefined): string | null {
  return value && !Number.isNaN(Date.parse(value)) ? value : null;
}

function compareVersions(left: string, right: string): number {
  const leftParts = numericVersion(left);
  const rightParts = numericVersion(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function numericVersion(value: string): number[] {
  const normalized = value.trim().replace(/^v/i, "").split("-", 1)[0];
  if (!normalized) return [];
  return normalized.split(".").map((part) => /^\d+$/.test(part) ? Number(part) : 0);
}
