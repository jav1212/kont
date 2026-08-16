import { CompanyFailure, type Company, type CompanyId } from "@kontave/companies-domain";
import type { OrganizationId } from "@kontave/organizations-domain";

export interface CompanyRepository {
  listByOrganization(organizationId: OrganizationId): Promise<readonly Company[]>;
  findById(organizationId: OrganizationId, companyId: CompanyId): Promise<Company | null>;
  save(company: Company): Promise<void>;
}

export class ListOrganizationCompanies {
  constructor(private readonly repository: CompanyRepository) {}
  async execute(organizationId: OrganizationId) {
    const companies = await this.repository.listByOrganization(organizationId);
    for (const company of companies) company.assertBelongsTo(organizationId);
    return companies;
  }
}

export class GetOperationalCompany {
  constructor(private readonly repository: CompanyRepository) {}
  async execute(organizationId: OrganizationId, id: CompanyId): Promise<Company> {
    const company = await this.repository.findById(organizationId, id);
    if (!company) throw new CompanyFailure("COMPANY_NOT_FOUND", "The company does not exist.");
    company.assertBelongsTo(organizationId);
    company.assertOperational();
    return company;
  }
}
