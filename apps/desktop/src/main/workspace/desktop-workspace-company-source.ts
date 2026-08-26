import type {
  ClientPortFeature,
  OrganizationCompanyDto,
  OrganizationsPort,
} from "@kontave/client-contracts";
import {
  companyId,
  organizationId,
  type OrganizationCompany,
  type OrganizationId,
} from "@kontave/organizations-domain";
import type { WorkspaceCompanySource } from "@kontave/workspace-context-application";
import { requireClientValue } from "../client/client-operation";

export class DesktopWorkspaceCompanySource implements WorkspaceCompanySource {
  constructor(
    private readonly organizations: ClientPortFeature<OrganizationsPort>,
  ) {}

  async listByOrganization(
    targetOrganizationId: OrganizationId,
  ): Promise<readonly OrganizationCompany[]> {
    return requireClientValue(
      await this.organizations.companies(targetOrganizationId),
    ).map(mapCompany);
  }
}

function mapCompany(value: OrganizationCompanyDto): OrganizationCompany {
  return {
    id: companyId(value.id),
    organizationId: organizationId(value.organizationId),
    name: value.name,
    rif: value.rif,
    logoUrl: value.logoUrl,
  };
}
