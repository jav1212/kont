import type { AvailableOrganizationModule } from "@kontave/modules-application";
import {
  KontaveRemoteClient,
  RemoteOrganizationsPort,
} from "@kontave/client-remote";
import type { ModuleCode, ModuleId } from "@kontave/modules-domain";
import type { OrganizationId } from "@kontave/organizations-domain";
import type { WorkspaceModuleSource } from "@kontave/workspace-context-application";
import type { DesktopAuthenticatedRequest } from "../auth/desktop-authenticated-request";

export class DesktopWorkspaceModuleSource implements WorkspaceModuleSource {
  private readonly organizations: RemoteOrganizationsPort;

  constructor(baseUrl: string, request: DesktopAuthenticatedRequest) {
    this.organizations = new RemoteOrganizationsPort(
      new KontaveRemoteClient({
        baseUrl,
        platform: "desktop",
        authenticatedRequest: (input, init) => request.fetch(input, init),
      }),
    );
  }

  async listAvailable(organizationId: OrganizationId): Promise<readonly AvailableOrganizationModule[]> {
    return (await this.organizations.modules(organizationId, "desktop")).map(
      (module) => ({
        id: module.id as ModuleId,
        code: module.code as ModuleCode,
        name: module.name,
      }),
    );
  }
}
