import type { BrowserWindow } from "electron";
import { DESKTOP_IPC, type DesktopCurrentUserState } from "../../shared/desktop-api.js";
import { DesktopCurrentUserSource } from "./desktop-current-user-source.js";

export class DesktopCurrentUserController {
  private state: DesktopCurrentUserState = { status: "unavailable" };

  constructor(
    private readonly source: DesktopCurrentUserSource,
    private readonly getWindow: () => BrowserWindow | undefined,
  ) {}

  getState(): DesktopCurrentUserState { return this.state; }

  async initialize(): Promise<DesktopCurrentUserState> {
    this.update({ status: "loading" });
    try {
      return this.update(await this.source.getCurrent());
    } catch (cause: unknown) {
      this.update({ status: "unavailable" });
      throw cause;
    }
  }

  clear(): DesktopCurrentUserState { return this.update({ status: "unavailable" }); }

  private update(state: DesktopCurrentUserState): DesktopCurrentUserState {
    this.state = state;
    this.getWindow()?.webContents.send(DESKTOP_IPC.currentUserChanged, state);
    return state;
  }
}
