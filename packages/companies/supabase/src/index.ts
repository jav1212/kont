import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CompanyRepository } from "@kontave/companies-application";
import { Company, CompanyCountry, CompanyFailure, CompanyStatus, companyId, taxId, type CompanyId } from "@kontave/companies-domain";
import { organizationId, type OrganizationId } from "@kontave/organizations-domain";
import { companyRowSchema } from "./persistence-codecs";

export function createCompanyRepository(configuration: { readonly url: string; readonly serviceRoleKey: string }): CompanyRepository {
  return new SupabaseCompanyRepository(createClient(configuration.url, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
}

class SupabaseCompanyRepository implements CompanyRepository {
  constructor(private readonly client: SupabaseClient) {}
  async listByOrganization(target: OrganizationId) {
    const { data, error } = await this.client.from("shared_companies").select("id,organization_id,name,rif").eq("organization_id", target).order("name");
    if (error) throw repositoryFailure(error);
    return companyRowSchema.array().parse(data ?? []).map(mapCompany);
  }
  async findById(targetOrganizationId: OrganizationId, id: CompanyId) {
    const { data, error } = await this.client.from("shared_companies").select("id,organization_id,name,rif").eq("organization_id", targetOrganizationId).eq("id", id).maybeSingle();
    if (error) throw repositoryFailure(error);
    return data ? mapCompany(companyRowSchema.parse(data)) : null;
  }
  async save(company: Company) {
    const { error } = await this.client.from("shared_companies").update({ name: company.legalName, rif: company.taxId, updated_at: new Date().toISOString() }).eq("id", company.id).eq("organization_id", company.organizationId);
    if (error) throw repositoryFailure(error);
  }
}

function mapCompany(row: ReturnType<typeof companyRowSchema.parse>) {
  return new Company({ id: companyId(row.id), organizationId: organizationId(row.organization_id), legacyCompanyId: row.id, legalName: row.name, tradeName: null, taxId: readLegacyTaxId(row.rif), country: CompanyCountry.Venezuela, status: CompanyStatus.Active });
}

/** A corrupt optional RIF must not make every company in a legacy workspace unavailable. */
function readLegacyTaxId(value: string | null) {
  if (!value) return null;
  try { return taxId(value); }
  catch (cause: unknown) {
    if (cause instanceof CompanyFailure && cause.code === "COMPANY_INVALID") return null;
    throw cause;
  }
}

function repositoryFailure(cause: unknown) {
  return new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "No se pudo acceder a las empresas.", { cause });
}
