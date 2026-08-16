import type { BrowserWindow } from "electron";
import { DESKTOP_IPC, type DesktopCurrentUserState } from "../../shared/desktop-api";
import { DesktopCurrentUserSource } from "./desktop-current-user-source";
import type { NativeCurrentUserDto } from "@kontave/native-api-contracts";

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

  synchronize(user: NativeCurrentUserDto): DesktopCurrentUserState {
    return this.update({
      status: "ready",
      user: {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    });
  }

  private update(state: DesktopCurrentUserState): DesktopCurrentUserState {
    this.state = state;
    this.getWindow()?.webContents.send(DESKTOP_IPC.currentUserChanged, state);
    return state;
  }
}
