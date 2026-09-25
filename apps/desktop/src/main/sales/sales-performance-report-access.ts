import type { DesktopWorkspaceState } from "../../renderer-bridge";

/**
 * Confirms a report request belongs to the selected workspace and has its explicit grant.
 * @param state Current Desktop workspace selection.
 * @param organization Organization identifier supplied at the IPC boundary.
 * @returns Whether the request may read sales performance totals.
 */
export function hasSalesPerformanceReportAccess(
  state: DesktopWorkspaceState,
  organization: unknown,
): boolean {
  return state.status === "ready" && state.activeWorkspaceId === organization &&
    state.workspaces.some((workspace) =>
      workspace.id === organization &&
      workspace.scopes.includes("sales.read") &&
      workspace.scopes.includes("sales.read.reporting"),
    );
}
