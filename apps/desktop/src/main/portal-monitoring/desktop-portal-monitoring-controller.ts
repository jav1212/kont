import type { BrowserWindow } from "electron";
import {
  DESKTOP_IPC,
  type DesktopPortalMonitoringState,
} from "../../renderer-bridge";
import { DesktopPortalMonitoringSource } from "./desktop-portal-monitoring-source";

export class DesktopPortalMonitoringController {
  private state: DesktopPortalMonitoringState = { status: "unavailable" };

  constructor(
    private readonly source: DesktopPortalMonitoringSource,
    private readonly getWindow: () => BrowserWindow | undefined,
  ) {}
  getState(): DesktopPortalMonitoringState {
    return this.state;
  }
  async initialize(): Promise<DesktopPortalMonitoringState> {
    this.update({ status: "loading" });
    try {
      return this.update(await this.source.getCurrent());
    } catch (cause: unknown) {
      this.clear();
      throw cause;
    }
  }
  clear(): DesktopPortalMonitoringState {
    return this.update({ status: "unavailable" });
  }
  private update(
    state: DesktopPortalMonitoringState,
  ): DesktopPortalMonitoringState {
    this.state = state;
    this.getWindow()?.webContents.send(
      DESKTOP_IPC.portalMonitoringChanged,
      state,
    );
    return state;
  }
}
