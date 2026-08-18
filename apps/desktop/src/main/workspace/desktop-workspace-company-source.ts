import type { OrganizationCompanyDto } from "@kontave/client-contracts";
import {
  KontaveRemoteClient,
  RemoteOrganizationsPort,
} from "@kontave/client-remote";
import { companyId, organizationId, type OrganizationCompany, type OrganizationId } from "@kontave/organizations-domain";
import type { WorkspaceCompanySource } from "@kontave/workspace-context-application";
import type { DesktopAuthenticatedRequest } from "../auth/desktop-authenticated-request";

export class DesktopWorkspaceCompanySource implements WorkspaceCompanySource {
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

  async listByOrganization(targetOrganizationId: OrganizationId): Promise<readonly OrganizationCompany[]> {
    return (await this.organizations.companies(targetOrganizationId)).map(mapCompany);
  }
}

function mapCompany(value: OrganizationCompanyDto): OrganizationCompany {
  return { id: companyId(value.id), organizationId: organizationId(value.organizationId), name: value.name, rif: value.rif, logoUrl: value.logoUrl };
}
