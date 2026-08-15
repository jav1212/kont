import type { BrowserWindow } from "electron";
import { OrganizationAccessPathKind } from "@kontave/organization-delegations-domain";
import type { ModuleCode } from "@kontave/modules-domain";
import { companyId, organizationId } from "@kontave/organizations-domain";
import {
  WorkspaceContextCoordinator,
  type WorkspaceContextFailure,
  type WorkspaceContextSnapshot,
  type WorkspaceContextStatus,
} from "@kontave/workspace-context-application";
import { DESKTOP_IPC, type DesktopWorkspaceResult, type DesktopWorkspaceState } from "../../shared/desktop-api.js";

export class DesktopWorkspaceController {
  private state: DesktopWorkspaceState = { status: "unavailable" };

  constructor(
    private readonly coordinator: WorkspaceContextCoordinator,
    private readonly getWindow: () => BrowserWindow | undefined,
  ) {
    coordinator.subscribe((state) => this.update(mapStatus(state)));
  }

  getState(): DesktopWorkspaceState { return this.state; }

  markUnavailable(): DesktopWorkspaceState { return this.update({ status: "unavailable" }); }

  async initialize(): Promise<DesktopWorkspaceState> {
    const state = await this.coordinator.restore();
    if (state.status === "failed" && !hasValidSnapshot(state.snapshot)) throw state.error;
    return this.state;
  }

  async refresh(): Promise<DesktopWorkspaceState> {
    const state = await this.coordinator.refresh();
    if (state.status === "failed" && !hasValidSnapshot(state.snapshot)) throw state.error;
    return this.state;
  }

  async clear(): Promise<DesktopWorkspaceState> {
    await this.coordinator.clear();
    return this.update({ status: "unavailable" });
  }

  async select(input: unknown): Promise<DesktopWorkspaceResult> {
    if (typeof input !== "string") return invalidResult("WORKSPACE_NOT_AVAILABLE", "El espacio de trabajo no es válido.");
    return this.toResult(await this.coordinator.selectWorkspace(organizationId(input)));
  }

  async selectModule(input: unknown): Promise<DesktopWorkspaceResult> {
    if (typeof input !== "string" || !isModuleCode(input)) return invalidResult("MODULE_NOT_AVAILABLE", "El módulo no es válido.");
    return this.toResult(await this.coordinator.selectModule(input as ModuleCode));
  }

  async selectCompany(input: unknown): Promise<DesktopWorkspaceResult> {
    if (typeof input !== "string") return invalidResult("COMPANY_NOT_AVAILABLE", "La empresa no es válida.");
    return this.toResult(await this.coordinator.selectCompany(companyId(input)));
  }

  private toResult(status: WorkspaceContextStatus): DesktopWorkspaceResult {
    return status.status === "failed"
      ? { ok: false, error: { code: status.error.code, message: status.error.message } }
      : { ok: true, value: this.state };
  }

  private update(state: DesktopWorkspaceState): DesktopWorkspaceState {
    this.state = state;
    this.getWindow()?.webContents.send(DESKTOP_IPC.workspaceStateChanged, state);
    return state;
  }
}

function mapStatus(state: WorkspaceContextStatus): DesktopWorkspaceState {
  if (state.status === "idle") return { status: "unavailable" };
  if ((state.status === "loading" || state.status === "refreshing") && !hasValidSnapshot(state.snapshot)) return { status: "loading" };
  if (state.status === "failed" && !hasValidSnapshot(state.snapshot)) return { status: "unavailable" };
  return mapSnapshot(state.snapshot);
}

function hasValidSnapshot(snapshot: WorkspaceContextSnapshot): boolean {
  return snapshot.activeWorkspace !== null || snapshot.portfolio.length > 0;
}

function mapSnapshot(snapshot: WorkspaceContextSnapshot): DesktopWorkspaceState {
  return {
    status: "ready",
    activeWorkspaceId: snapshot.activeWorkspace?.organizationId ?? null,
    activeModuleId: snapshot.activeModule?.code ?? null,
    modules: snapshot.modules.map((module) => ({ id: module.code, name: module.name })),
    activeCompanyId: snapshot.activeCompany?.id ?? null,
    companies: snapshot.companies.map((company) => ({
      id: company.id,
      name: company.name,
      rif: company.rif,
      ...(company.logoUrl ? { logoUrl: company.logoUrl } : {}),
    })),
    workspaces: snapshot.portfolio.map((entry) => ({
      id: entry.organizationId,
      name: entry.name,
      ...(entry.avatarUrl ? { avatarUrl: entry.avatarUrl } : {}),
      access: entry.accessPath.kind === OrganizationAccessPathKind.DirectMembership ? "direct" : "delegated",
      relationship: entry.relationship,
      scopes: entry.accessPath.scopes,
    })),
  };
}

function invalidResult(code: WorkspaceContextFailure["code"], message: string): DesktopWorkspaceResult {
  return { ok: false, error: { code, message } };
}

function isModuleCode(value: string): boolean {
  return value === "payroll" || value === "purchases" || value === "sales"
    || value === "inventory" || value === "accounting" || value === "tools"
    || value === "companies" || value === "documents";
}
