import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CompanyRepository } from "@kontave/companies-application";
import { Company, CompanyFailure, companyId, taxId, type CompanyId } from "@kontave/companies-domain";
import { organizationId, type OrganizationId } from "@kontave/organizations-domain";
import { companyRowSchema } from "./persistence-codecs";

export function createCompanyRepository(configuration: { readonly url: string; readonly serviceRoleKey: string }): CompanyRepository {
  return new SupabaseCompanyRepository(createClient(configuration.url, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
}

class SupabaseCompanyRepository implements CompanyRepository {
  constructor(private readonly client: SupabaseClient) {}
  async listByOrganization(target: OrganizationId) {
    const { data, error } = await this.client.from("companies").select("id,organization_id,legacy_company_id,legal_name,trade_name,tax_id,country_code,status").eq("organization_id", target).order("legal_name");
    if (error) throw repositoryFailure(error);
    return companyRowSchema.array().parse(data ?? []).map(mapCompany);
  }
  async findById(id: CompanyId) {
    const { data, error } = await this.client.from("companies").select("id,organization_id,legacy_company_id,legal_name,trade_name,tax_id,country_code,status").eq("id", id).maybeSingle();
    if (error) throw repositoryFailure(error);
    return data ? mapCompany(companyRowSchema.parse(data)) : null;
  }
  async save(company: Company) {
    const { error } = await this.client.from("companies").upsert({ id: company.id, organization_id: company.organizationId, legacy_company_id: company.legacyCompanyId, legal_name: company.legalName, trade_name: company.tradeName, tax_id: company.taxId, country_code: company.country, status: company.status, updated_at: new Date().toISOString() });
    if (error) throw repositoryFailure(error);
  }
}

function mapCompany(row: ReturnType<typeof companyRowSchema.parse>) {
  return new Company({ id: companyId(row.id), organizationId: organizationId(row.organization_id), legacyCompanyId: row.legacy_company_id, legalName: row.legal_name, tradeName: row.trade_name, taxId: row.tax_id ? taxId(row.tax_id) : null, country: row.country_code, status: row.status });
}

function repositoryFailure(cause: unknown) {
  return new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "No se pudo acceder a las empresas.", { cause });
}
