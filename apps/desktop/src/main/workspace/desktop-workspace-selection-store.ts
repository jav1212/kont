import { app } from "electron";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { organizationId, type OrganizationId } from "@kontave/organizations-domain";
import type { ActiveWorkspaceSelectionStore } from "@kontave/workspace-context-application";

export class DesktopWorkspaceSelectionStore implements ActiveWorkspaceSelectionStore {
  private readonly filePath = join(app.getPath("userData"), "workspace-context.json");

  async read(): Promise<OrganizationId | null> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!parsed || typeof parsed !== "object" || !("activeWorkspaceId" in parsed)) return null;
      const value = (parsed as { readonly activeWorkspaceId?: unknown }).activeWorkspaceId;
      return typeof value === "string" && value.trim() ? organizationId(value) : null;
    } catch (cause: unknown) {
      if (isMissingFile(cause) || cause instanceof SyntaxError) return null;
      throw cause;
    }
  }

  async write(activeWorkspaceId: OrganizationId | null): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify({ activeWorkspaceId }), { encoding: "utf8", mode: 0o600 });
    try {
      await rename(temporaryPath, this.filePath);
    } catch (cause: unknown) {
      await rm(temporaryPath, { force: true });
      throw cause;
    }
  }
}

function isMissingFile(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}
