import assert from "node:assert/strict";
import test from "node:test";
import { ElectronClientUpdateProvider, type ElectronUpdaterPort } from "../src/index";

class FakeElectronUpdater implements ElectronUpdaterPort {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  installed = false;
  private progressListener: ((progress: { readonly percent: number }) => void) | null = null;

  async checkForUpdates() {
    return { isUpdateAvailable: true, updateInfo: { version: "1.2.0", releaseDate: "2026-08-14T12:00:00.000Z" } };
  }
  async downloadUpdate(): Promise<readonly string[]> {
    this.progressListener?.({ percent: 42 });
    return ["update.exe"];
  }
  quitAndInstall(): void { this.installed = true; }
  on(_event: "download-progress", listener: (progress: { readonly percent: number }) => void): void { this.progressListener = listener; }
  off(): void { this.progressListener = null; }
}

const installed = {
  product: "kontave-desktop", platform: "win32", architecture: "x64", channel: "production",
  productVersion: "1.0.0", buildNumber: null, runtimeVersion: null, apiVersion: "v1",
} as const;

test("electron adapter owns SDK behavior and exposes portable releases", async () => {
  const updater = new FakeElectronUpdater();
  const provider = new ElectronClientUpdateProvider(updater, { installed, enabled: true });
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  const result = await provider.check();
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.equal(result.release.kind, "binary");
  const progress: number[] = [];
  await provider.download(result.release, (value) => progress.push(value));
  assert.deepEqual(progress, [0.42]);
  await provider.apply(result.release);
  assert.equal(updater.installed, true);
});
