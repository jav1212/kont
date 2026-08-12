import type { CompanyRepository } from "@kontave/companies-application";
import type { Company, CompanyId } from "@kontave/companies-domain";
import type { OrganizationId } from "@kontave/organizations-domain";

export class InMemoryCompanyRepository implements CompanyRepository {
  constructor(readonly companies: Company[] = []) {}
  async listByOrganization(organizationId: OrganizationId) { return this.companies.filter((company) => company.organizationId === organizationId); }
  async findById(id: CompanyId) { return this.companies.find((company) => company.id === id) ?? null; }
  async save(company: Company) {
    const current = this.companies.findIndex((item) => item.id === company.id);
    if (current < 0) this.companies.push(company); else this.companies.splice(current, 1, company);
  }
}
