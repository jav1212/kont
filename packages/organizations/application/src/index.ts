import {
  OrganizationFailure,
  hasActiveOrganizationAccess,
  isOrganizationOwner,
  type CompanyId,
  type OrganizationAccess,
  type OrganizationCompany,
  type OrganizationId,
  type UserId,
} from "@kontave/organizations-domain";

export interface OrganizationDirectory {
  listAccessForUser(userId: UserId): Promise<readonly OrganizationAccess[]>;
  findAccess(userId: UserId, organizationId: OrganizationId): Promise<OrganizationAccess | null>;
  listCompanies(organizationId: OrganizationId): Promise<readonly OrganizationCompany[]>;
  findCompany(organizationId: OrganizationId, companyId: CompanyId): Promise<OrganizationCompany | null>;
}

export interface OrganizationPresentation {
  readonly organizationId: OrganizationId;
  readonly avatarUrl: string | null;
}

export interface OrganizationPresentationDirectory {
  listByOrganizationIds(
    organizationIds: readonly OrganizationId[],
  ): Promise<readonly OrganizationPresentation[]>;
}

export class ListOrganizations {
  constructor(private readonly directory: OrganizationDirectory) {}

  async execute(userId: UserId): Promise<readonly OrganizationAccess[]> {
    const access = await this.directory.listAccessForUser(userId);
    return access
      .filter(hasActiveOrganizationAccess)
      .sort((left, right) => {
        if (isOrganizationOwner(left.membership) && !isOrganizationOwner(right.membership)) return -1;
        if (!isOrganizationOwner(left.membership) && isOrganizationOwner(right.membership)) return 1;
        return left.organization.name.localeCompare(right.organization.name);
      });
  }
}

export class ListOrganizationCompanies {
  constructor(private readonly directory: OrganizationDirectory) {}

  async execute(userId: UserId, organizationId: OrganizationId): Promise<readonly OrganizationCompany[]> {
    await requireOrganizationAccess(this.directory, userId, organizationId);
    const companies = await this.directory.listCompanies(organizationId);
    if (companies.some((company) => company.organizationId !== organizationId)) {
      throw new OrganizationFailure("COMPANY_ACCESS_DENIED", "Una empresa no pertenece a la organización.");
    }
    return companies;
  }
}

export class GetOrganization {
  constructor(private readonly directory: OrganizationDirectory) {}

  execute(userId: UserId, organizationId: OrganizationId): Promise<OrganizationAccess> {
    return requireOrganizationAccess(this.directory, userId, organizationId);
  }
}

export class GetOrganizationCompany {
  constructor(private readonly directory: OrganizationDirectory) {}

  async execute(userId: UserId, organizationId: OrganizationId, companyId: CompanyId): Promise<OrganizationCompany> {
    await requireOrganizationAccess(this.directory, userId, organizationId);
    const company = await this.directory.findCompany(organizationId, companyId);
    if (!company) throw new OrganizationFailure("COMPANY_NOT_FOUND", "La empresa no existe.");
    if (company.organizationId !== organizationId) {
      throw new OrganizationFailure("COMPANY_ACCESS_DENIED", "La empresa no pertenece a la organización.");
    }
    return company;
  }
}

export async function requireOrganizationAccess(
  directory: OrganizationDirectory,
  userId: UserId,
  organizationId: OrganizationId,
): Promise<OrganizationAccess> {
  const access = await directory.findAccess(userId, organizationId);
  if (!access || !hasActiveOrganizationAccess(access)) {
    throw new OrganizationFailure("ORGANIZATION_ACCESS_DENIED", "No tienes acceso a esta organización.");
  }
  return access;
}
