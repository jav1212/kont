import type {
  OrganizationCompanyDto,
  OrganizationDto,
} from "@kontave/client-contracts";
import type {
  OrganizationAccess,
  OrganizationCompany,
} from "@kontave/organizations/domain";

export function toOrganizationDto(access: OrganizationAccess): OrganizationDto {
  return {
    id: access.organization.id,
    name: access.organization.name,
    slug: access.organization.slug,
    role: access.membership.role,
    permissions: access.membership.permissions,
    logoUrl: access.organization.logoUrl,
    version: access.organization.version,
  };
}

export function toCompanyDto(
  company: OrganizationCompany,
): OrganizationCompanyDto {
  return {
    id: company.id,
    organizationId: company.organizationId,
    name: company.name,
    rif: company.rif,
    logoUrl: company.logoUrl,
    operatingProfile: company.operatingProfile,
  };
}
