import type { BrowserWindow } from "electron";
import { DESKTOP_IPC, type DesktopPlatformStatusState } from "../../shared/desktop-api.js";
import { DesktopPlatformStatusSource } from "./desktop-platform-status-source.js";

export class DesktopPlatformStatusController {
  private state: DesktopPlatformStatusState = { status: "unavailable" };

  constructor(private readonly source: DesktopPlatformStatusSource, private readonly getWindow: () => BrowserWindow | undefined) {}
  getState(): DesktopPlatformStatusState { return this.state; }
  async initialize(): Promise<DesktopPlatformStatusState> {
    this.update({ status: "loading" });
    try { return this.update(await this.source.getCurrent()); }
    catch (cause: unknown) { this.clear(); throw cause; }
  }
  clear(): DesktopPlatformStatusState { return this.update({ status: "unavailable" }); }
  private update(state: DesktopPlatformStatusState): DesktopPlatformStatusState {
    this.state = state;
    this.getWindow()?.webContents.send(DESKTOP_IPC.platformStatusChanged, state);
    return state;
  }
}
