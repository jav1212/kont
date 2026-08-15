import { ActivateModule, InstallModule, ListAvailableModules, ListAvailableOrganizationModules, ListOrganizationModules, SuspendModule } from "@kontave/modules-application";
import { createModulesInfrastructure } from "@kontave/modules-supabase";

export function createModuleActions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Native module infrastructure is not configured.");
  const infrastructure = createModulesInfrastructure({ url, serviceRoleKey });
  return {
    catalog: new ListAvailableModules(infrastructure.catalog),
    availableOrganizationModules: new ListAvailableOrganizationModules(infrastructure.catalog, infrastructure.installations),
    organizationModules: new ListOrganizationModules(infrastructure.installations),
    install: new InstallModule(infrastructure.catalog, infrastructure.installations, infrastructure.entitlements),
    activate: new ActivateModule(infrastructure.catalog, infrastructure.installations, infrastructure.entitlements),
    suspend: new SuspendModule(infrastructure.catalog, infrastructure.installations),
  };
}
