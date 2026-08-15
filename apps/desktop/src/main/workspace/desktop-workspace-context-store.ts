import { app } from "electron";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ModuleCode } from "@kontave/modules-domain";
import { companyId, organizationId, type CompanyId, type OrganizationId } from "@kontave/organizations-domain";
import type { PersistedWorkspaceContext, WorkspaceContextStore } from "@kontave/workspace-context-application";
import { DesktopWorkspaceCompanyStore } from "./desktop-workspace-company-store.js";
import { DesktopWorkspaceModuleStore } from "./desktop-workspace-module-store.js";
import { DesktopWorkspaceSelectionStore } from "./desktop-workspace-selection-store.js";

export class DesktopWorkspaceContextStore implements WorkspaceContextStore {
  private readonly filePath = join(app.getPath("userData"), "workspace-context-v2.json");

  async read(): Promise<PersistedWorkspaceContext> {
    try {
      const value = parseContext(JSON.parse(await readFile(this.filePath, "utf8")));
      if (value) return value;
    } catch (cause: unknown) {
      if (!isMissingFile(cause) && !(cause instanceof SyntaxError)) throw cause;
    }
    return this.readLegacyContext();
  }

  async write(context: PersistedWorkspaceContext): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(context), { encoding: "utf8", mode: 0o600 });
    try { await rename(temporaryPath, this.filePath); }
    catch (cause: unknown) { await rm(temporaryPath, { force: true }); throw cause; }
  }

  private async readLegacyContext(): Promise<PersistedWorkspaceContext> {
    const organization = await new DesktopWorkspaceSelectionStore().read();
    if (!organization) return { organizationId: null, companyId: null, moduleCode: null };
    const [selectedCompany, selectedModule] = await Promise.all([
      new DesktopWorkspaceCompanyStore().read(organization),
      new DesktopWorkspaceModuleStore().read(organization),
    ]);
    return { organizationId: organization, companyId: selectedCompany, moduleCode: selectedModule };
  }
}

function parseContext(value: unknown): PersistedWorkspaceContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    organizationId: readOrganizationId(record.organizationId),
    companyId: readCompanyId(record.companyId),
    moduleCode: readModuleCode(record.moduleCode),
  };
}

function readOrganizationId(value: unknown): OrganizationId | null { return typeof value === "string" && value.trim() ? organizationId(value) : null; }
function readCompanyId(value: unknown): CompanyId | null { return typeof value === "string" && value.trim() ? companyId(value) : null; }
function readModuleCode(value: unknown): ModuleCode | null {
  return typeof value === "string" && ["payroll", "purchases", "sales", "inventory", "accounting", "tools", "companies", "documents"].includes(value)
    ? value as ModuleCode
    : null;
}
function isMissingFile(cause: unknown): boolean { return cause instanceof Error && "code" in cause && cause.code === "ENOENT"; }
