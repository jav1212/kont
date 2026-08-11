import type { OrganizationDirectory } from "@kontave/organizations-application";
import type {
  CompanyId,
  OrganizationAccess,
  OrganizationCompany,
  OrganizationId,
  UserId,
} from "@kontave/organizations-domain";

export class InMemoryOrganizationDirectory implements OrganizationDirectory {
  constructor(
    private readonly access: readonly OrganizationAccess[] = [],
    private readonly companies: readonly OrganizationCompany[] = [],
  ) {}

  async listAccessForUser(targetUserId: UserId): Promise<readonly OrganizationAccess[]> {
    return this.access.filter((entry) => entry.membership.userId === targetUserId);
  }

  async findAccess(targetUserId: UserId, targetOrganizationId: OrganizationId): Promise<OrganizationAccess | null> {
    return this.access.find((entry) =>
      entry.membership.userId === targetUserId && entry.organization.id === targetOrganizationId,
    ) ?? null;
  }

  async listCompanies(targetOrganizationId: OrganizationId): Promise<readonly OrganizationCompany[]> {
    return this.companies.filter((company) => company.organizationId === targetOrganizationId);
  }

  async findCompany(targetOrganizationId: OrganizationId, targetCompanyId: CompanyId): Promise<OrganizationCompany | null> {
    return this.companies.find((company) =>
      company.organizationId === targetOrganizationId && company.id === targetCompanyId,
    ) ?? null;
  }
}
