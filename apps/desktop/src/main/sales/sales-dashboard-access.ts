import type { DesktopWorkspaceState } from "../../renderer-bridge";
import { canReadSalesDashboard } from "@kontave/sales/application";

/**
 * Confirms an IPC dashboard request belongs to the active workspace and satisfies core policy.
 * @param state - Current Desktop workspace selection.
 * @param organization - Organization identifier supplied at the IPC boundary.
 * @returns Whether the request may load the sales dashboard.
 */
export function hasSalesDashboardAccess(
  state: DesktopWorkspaceState,
  organization: unknown,
): boolean {
  return state.status === "ready" &&
    state.activeWorkspaceId === organization &&
    state.workspaces.some(
      (workspace) => workspace.id === organization && canReadSalesDashboard(workspace.permissions),
    );
}
