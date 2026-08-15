import { app } from "electron";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ModuleCode } from "@kontave/modules-domain";
import type { OrganizationId } from "@kontave/organizations-domain";
import type { ActiveWorkspaceModuleStore } from "@kontave/workspace-context-application";

export class DesktopWorkspaceModuleStore implements ActiveWorkspaceModuleStore {
  private readonly filePath = join(app.getPath("userData"), "workspace-modules.json");

  async read(organizationId: OrganizationId): Promise<ModuleCode | null> {
    const selections = await this.readSelections();
    const value = selections[organizationId];
    return isModuleCode(value) ? value as ModuleCode : null;
  }

  async write(organizationId: OrganizationId, moduleCode: ModuleCode | null): Promise<void> {
    const selections = await this.readSelections();
    if (moduleCode) selections[organizationId] = moduleCode;
    else delete selections[organizationId];
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(selections), { encoding: "utf8", mode: 0o600 });
    try { await rename(temporaryPath, this.filePath); }
    catch (cause: unknown) { await rm(temporaryPath, { force: true }); throw cause; }
  }

  private async readSelections(): Promise<Record<string, string>> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    } catch (cause: unknown) {
      if (isMissingFile(cause) || cause instanceof SyntaxError) return {};
      throw cause;
    }
  }
}

function isMissingFile(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}

function isModuleCode(value: unknown): value is string {
  return value === "payroll" || value === "purchases" || value === "sales"
    || value === "inventory" || value === "accounting" || value === "tools"
    || value === "companies" || value === "documents";
}
