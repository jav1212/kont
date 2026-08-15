import type { BrowserWindow } from "electron";
import { DESKTOP_IPC, type DesktopBillingPlanState } from "../../shared/desktop-api.js";
import { DesktopBillingPlanSource } from "./desktop-billing-plan-source.js";

export class DesktopBillingPlanController {
  private state: DesktopBillingPlanState = { status: "unavailable" };

  constructor(
    private readonly source: DesktopBillingPlanSource,
    private readonly getWindow: () => BrowserWindow | undefined,
  ) {}

  getState(): DesktopBillingPlanState { return this.state; }

  async initialize(organizationId: string | null): Promise<DesktopBillingPlanState> {
    if (!organizationId) return this.clear();
    this.update({ status: "loading" });
    try {
      return this.update(await this.source.getForOrganization(organizationId));
    } catch (cause: unknown) {
      this.clear();
      throw cause;
    }
  }

  clear(): DesktopBillingPlanState { return this.update({ status: "unavailable" }); }

  private update(state: DesktopBillingPlanState): DesktopBillingPlanState {
    this.state = state;
    this.getWindow()?.webContents.send(DESKTOP_IPC.billingPlanChanged, state);
    return state;
  }
}
