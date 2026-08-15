import { app } from "electron";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { companyId, type CompanyId, type OrganizationId } from "@kontave/organizations-domain";
import type { ActiveWorkspaceCompanyStore } from "@kontave/workspace-context-application";

export class DesktopWorkspaceCompanyStore implements ActiveWorkspaceCompanyStore {
  private readonly filePath = join(app.getPath("userData"), "workspace-companies.json");

  async read(organizationId: OrganizationId): Promise<CompanyId | null> {
    const selections = await this.readSelections();
    const value = selections[organizationId];
    return value ? companyId(value) : null;
  }

  async write(organizationId: OrganizationId, selectedCompanyId: CompanyId | null): Promise<void> {
    const selections = await this.readSelections();
    if (selectedCompanyId) selections[organizationId] = selectedCompanyId;
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
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && !!entry[1].trim()));
    } catch (cause: unknown) {
      if (cause instanceof SyntaxError || (cause instanceof Error && "code" in cause && cause.code === "ENOENT")) return {};
      throw cause;
    }
  }
}
