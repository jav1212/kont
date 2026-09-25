import type { ModuleCode } from "@kontave/modules/domain";
import { APP_MODULES } from "@/src/shared/frontend/navigation";
import {
  getModuleVisibilityPermission,
  getOrganizationRouteAccess,
  hasOrganizationPermission,
  resolveSalesLanding,
} from "../../organizations/frontend/module-access-policy";

/** Safe authenticated entry used immediately after a successful badge exchange. */
export const BARCODE_LOGIN_LANDING_HREF = "/tools?barcode-landing=1";

/**
 * Resolves the first committed workspace module into a route that is safe for
 * a terminal-bound badge session to open.
 *
 * @param activeModuleCode - Module selected by the restored workspace.
 * @param availableModules - Modules admitted by the committed workspace.
 * @param permissions - Effective permissions of the selected organization.
 * @returns An authorized module home route, or the safe Tools fallback.
 */
export function resolveBarcodeWorkspaceLanding(
  activeModuleCode: ModuleCode | null,
  availableModules: readonly { readonly code: ModuleCode }[],
  permissions: readonly string[],
): string {
  if (
    !activeModuleCode ||
    !availableModules.some((module) => module.code === activeModuleCode)
  )
    return "/tools";

  const navigation = APP_MODULES.find(
    (entry) => entry.id === activeModuleCode && !("parentId" in entry),
  );
  if (!navigation) return "/tools";

  const visibility = getModuleVisibilityPermission(navigation.id);
  if (visibility && !hasOrganizationPermission(permissions, visibility))
    return "/tools";

  if (navigation.id === "sales") return resolveSalesLanding(permissions) ?? "/tools";

  const routeAccess = getOrganizationRouteAccess(navigation.href);
  if (routeAccess.kind === "unknown") return "/tools";
  if (
    routeAccess.kind === "protected" &&
    !routeAccess.permissions.every((permission) =>
      hasOrganizationPermission(permissions, permission),
    )
  )
    return "/tools";

  return navigation.href;
}
