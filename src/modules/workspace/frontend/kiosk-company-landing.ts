import { ModuleCode } from "@kontave/modules/domain";
import { resolveSalesLanding } from "../../organizations/frontend/module-access-policy";

export type CompanyOperatingProfile = "standard" | "kiosk";

/** Resolves the safe landing after a company-scoped operating profile changes.
 * @param profile - Persisted company profile selected in the committed workspace.
 * @param availableModules - Modules admitted by the current subscription and organization scope.
 * @param permissions - Effective organization permissions.
 * @param inventorySubscriptionActive - Whether the package that includes Kiosco is active.
 * @returns A route available to the current user without granting new access.
 */
export function resolveCompanyProfileLanding(
  profile: CompanyOperatingProfile,
  availableModules: readonly ModuleCode[],
  permissions: readonly string[],
  inventorySubscriptionActive: boolean,
): string {
  const can = (permission: string) =>
    permissions.includes("*") || permissions.includes(permission);
  const hasModule = (module: ModuleCode) => availableModules.includes(module);
  const firstAvailable = (): string => {
    if (hasModule(ModuleCode.Payroll) && can("payroll.read")) return "/payroll/tablero";
    if (hasModule(ModuleCode.Sales) && can("sales.read")) return resolveSalesLanding(permissions);
    if (hasModule(ModuleCode.Purchases) && can("purchases.read")) return "/purchases";
    if (hasModule(ModuleCode.Inventory) && can("inventory.read")) return "/inventory";
    if (hasModule(ModuleCode.Accounting) && can("accounting.read")) return "/accounting";
    return "/tools";
  };

  if (profile !== "kiosk") return firstAvailable();
  if (!inventorySubscriptionActive)
    return can("billing.read") ? "/settings/billing" : "/tools";
  if (hasModule(ModuleCode.Sales) && can("sales.read") && can("sales.create"))
    return "/sales/pos";
  if (hasModule(ModuleCode.Sales) && can("sales.read")) return resolveSalesLanding(permissions);
  if (hasModule(ModuleCode.Purchases) && can("purchases.read")) return "/purchases";
  if (hasModule(ModuleCode.Inventory) && can("inventory.read")) return "/inventory";
  return can("billing.read") ? "/settings/billing" : firstAvailable();
}
