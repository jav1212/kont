import type { CompanyDto } from "@kontave/client-contracts";
import type { Company } from "@kontave/companies/domain";

export function toCompanyDto(company: Company): CompanyDto {
  return {
    id: company.id,
    organizationId: company.organizationId,
    legacyCompanyId: company.legacyCompanyId,
    legalName: company.legalName,
    tradeName: company.tradeName,
    taxId: company.taxId,
    country: company.country,
    status: company.status,
    operatingProfile: company.operatingProfile,
  };
}
