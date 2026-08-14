import type { BrowserWindow } from "electron";
import { OrganizationAccessPathKind } from "@kontave/organization-delegations-domain";
import { organizationId } from "@kontave/organizations-domain";
import { WorkspaceContextSession, type ActiveWorkspaceContext } from "@kontave/workspace-context-application";
import {
  DESKTOP_IPC,
  type DesktopWorkspaceResult,
  type DesktopWorkspaceState,
} from "../../shared/desktop-api.js";

export class DesktopWorkspaceController {
  private state: DesktopWorkspaceState = { status: "unavailable" };

  constructor(
    private readonly session: WorkspaceContextSession,
    private readonly getWindow: () => BrowserWindow | undefined,
  ) {}

  getState(): DesktopWorkspaceState { return this.state; }

  markUnavailable(): DesktopWorkspaceState {
    return this.update({ status: "unavailable" });
  }

  async initialize(): Promise<DesktopWorkspaceState> {
    this.update({ status: "loading" });
    try {
      return this.update(mapContext(await this.session.restore()));
    } catch (cause: unknown) {
      this.update({ status: "unavailable" });
      throw cause;
    }
  }

  async clear(): Promise<DesktopWorkspaceState> {
    await this.session.clear();
    return this.update({ status: "unavailable" });
  }

  async select(input: unknown): Promise<DesktopWorkspaceResult> {
    try {
      if (typeof input !== "string") throw new TypeError("Workspace id is invalid.");
      return { ok: true, value: this.update(mapContext(await this.session.select(organizationId(input)))) };
    } catch {
      return { ok: false, error: { message: "No se pudo cambiar el espacio de trabajo." } };
    }
  }

  private update(state: DesktopWorkspaceState): DesktopWorkspaceState {
    this.state = state;
    this.getWindow()?.webContents.send(DESKTOP_IPC.workspaceStateChanged, state);
    return state;
  }
}

function mapContext(context: ActiveWorkspaceContext): DesktopWorkspaceState {
  return {
    status: "ready",
    activeWorkspaceId: context.active?.organizationId ?? null,
    workspaces: context.portfolio.map((entry) => ({
      id: entry.organizationId,
      name: entry.name,
      ...(entry.avatarUrl ? { avatarUrl: entry.avatarUrl } : {}),
      access: entry.accessPath.kind === OrganizationAccessPathKind.DirectMembership ? "direct" : "delegated",
      scopes: entry.accessPath.scopes,
    })),
  };
}
