import type { AvailableOrganizationModule } from "@kontave/modules-application";
import type {
  ClientPortFeature,
  OrganizationsPort,
} from "@kontave/client-contracts";
import type { ModuleCode, ModuleId } from "@kontave/modules-domain";
import type { OrganizationId } from "@kontave/organizations-domain";
import type { WorkspaceModuleSource } from "@kontave/workspace-context-application";
import { requireClientValue } from "../client/client-operation";

export class DesktopWorkspaceModuleSource implements WorkspaceModuleSource {
  constructor(
    private readonly organizations: ClientPortFeature<OrganizationsPort>,
  ) {}

  async listAvailable(
    organizationId: OrganizationId,
  ): Promise<readonly AvailableOrganizationModule[]> {
    return requireClientValue(
      await this.organizations.modules(organizationId, "desktop"),
    ).map((module) => ({
      id: module.id as ModuleId,
      code: module.code as ModuleCode,
      name: module.name,
    }));
  }
}
