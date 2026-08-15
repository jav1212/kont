import type { BrowserWindow } from "electron";
import { OrganizationAccessPathKind } from "@kontave/organization-delegations-domain";
import type { ModuleCode } from "@kontave/modules-domain";
import { companyId, organizationId } from "@kontave/organizations-domain";
import { WorkspaceCompanyContextSession, WorkspaceContextSession, WorkspaceModuleContextSession, type ActiveWorkspaceCompanyContext, type ActiveWorkspaceContext, type ActiveWorkspaceModuleContext } from "@kontave/workspace-context-application";
import {
  DESKTOP_IPC,
  type DesktopWorkspaceResult,
  type DesktopWorkspaceState,
} from "../../shared/desktop-api.js";

export class DesktopWorkspaceController {
  private state: DesktopWorkspaceState = { status: "unavailable" };

  constructor(
    private readonly session: WorkspaceContextSession,
    private readonly modules: WorkspaceModuleContextSession,
    private readonly companies: WorkspaceCompanyContextSession,
    private readonly getWindow: () => BrowserWindow | undefined,
  ) {}

  getState(): DesktopWorkspaceState { return this.state; }

  markUnavailable(): DesktopWorkspaceState {
    return this.update({ status: "unavailable" });
  }

  async initialize(): Promise<DesktopWorkspaceState> {
    this.update({ status: "loading" });
    try {
      const context = await this.session.restore();
      const organization = context.active?.organizationId ?? null;
      const [modules, companies] = await Promise.all([this.restoreModules(organization), this.restoreCompanies(organization)]);
      return this.update(mapContext(context, modules, companies));
    } catch (cause: unknown) {
      this.update({ status: "unavailable" });
      throw cause;
    }
  }

  async clear(): Promise<DesktopWorkspaceState> {
    await this.session.clear();
    await this.modules.clear();
    await this.companies.clear();
    return this.update({ status: "unavailable" });
  }

  async select(input: unknown): Promise<DesktopWorkspaceResult> {
    try {
      if (typeof input !== "string") throw new TypeError("Workspace id is invalid.");
      const context = await this.session.select(organizationId(input));
      const organization = context.active?.organizationId ?? null;
      const [modules, companies] = await Promise.all([this.restoreModules(organization), this.restoreCompanies(organization)]);
      return { ok: true, value: this.update(mapContext(context, modules, companies)) };
    } catch {
      return { ok: false, error: { message: "No se pudo cambiar el espacio de trabajo." } };
    }
  }

  async selectModule(input: unknown): Promise<DesktopWorkspaceResult> {
    try {
      if (typeof input !== "string") throw new TypeError("Module code is invalid.");
      if (!isModuleCode(input)) throw new TypeError("Module code is invalid.");
      const code = input as ModuleCode;
      return { ok: true, value: this.update(mapContext(this.session.current, await this.modules.select(code), this.companies.current)) };
    } catch {
      return { ok: false, error: { message: "No se pudo cambiar el módulo activo." } };
    }
  }

  async selectCompany(input: unknown): Promise<DesktopWorkspaceResult> {
    try {
      if (typeof input !== "string") throw new TypeError("Company id is invalid.");
      return { ok: true, value: this.update(mapContext(this.session.current, this.modules.current, await this.companies.select(companyId(input)))) };
    } catch {
      return { ok: false, error: { message: "No se pudo cambiar la empresa activa." } };
    }
  }

  private async restoreModules(organization: ReturnType<typeof organizationId> | null): Promise<ActiveWorkspaceModuleContext> {
    try { return await this.modules.restore(organization); }
    catch (cause: unknown) {
      await this.modules.clear();
      console.error(JSON.stringify({
        level: "error",
        code: "DESKTOP_WORKSPACE_MODULES_REFRESH_FAILED",
        message: cause instanceof Error ? cause.message : "Unknown workspace modules refresh failure",
      }));
      return this.modules.current;
    }
  }

  private async restoreCompanies(organization: ReturnType<typeof organizationId> | null): Promise<ActiveWorkspaceCompanyContext> {
    try { return await this.companies.restore(organization); }
    catch (cause: unknown) {
      await this.companies.clear();
      console.error(JSON.stringify({
        level: "error",
        code: "DESKTOP_WORKSPACE_COMPANIES_REFRESH_FAILED",
        message: cause instanceof Error ? cause.message : "Unknown workspace companies refresh failure",
      }));
      return this.companies.current;
    }
  }

  private update(state: DesktopWorkspaceState): DesktopWorkspaceState {
    this.state = state;
    this.getWindow()?.webContents.send(DESKTOP_IPC.workspaceStateChanged, state);
    return state;
  }
}

function isModuleCode(value: string): boolean {
  return value === "payroll" || value === "purchases" || value === "sales"
    || value === "inventory" || value === "accounting" || value === "tools"
    || value === "companies" || value === "documents";
}

function mapContext(context: ActiveWorkspaceContext, modules: ActiveWorkspaceModuleContext, companies: ActiveWorkspaceCompanyContext): DesktopWorkspaceState {
  return {
    status: "ready",
    activeWorkspaceId: context.active?.organizationId ?? null,
    activeModuleId: modules.active?.code ?? null,
    modules: modules.modules.map((module) => ({ id: module.code, name: module.name })),
    activeCompanyId: companies.active?.id ?? null,
    companies: companies.companies.map((company) => ({
      id: company.id,
      name: company.name,
      rif: company.rif,
      ...(company.logoUrl ? { logoUrl: company.logoUrl } : {}),
    })),
    workspaces: context.portfolio.map((entry) => ({
      id: entry.organizationId,
      name: entry.name,
      ...(entry.avatarUrl ? { avatarUrl: entry.avatarUrl } : {}),
      access: entry.accessPath.kind === OrganizationAccessPathKind.DirectMembership ? "direct" : "delegated",
      relationship: entry.relationship,
      scopes: entry.accessPath.scopes,
    })),
  };
}
