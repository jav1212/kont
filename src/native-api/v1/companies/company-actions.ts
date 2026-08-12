import { GetOperationalCompany, ListOrganizationCompanies } from "@kontave/companies-application";
import { createCompanyRepository } from "@kontave/companies-supabase";

export function createCompanyActions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Native company infrastructure is not configured.");
  const repository = createCompanyRepository({ url, serviceRoleKey });
  return { list: new ListOrganizationCompanies(repository), getOperational: new GetOperationalCompany(repository) };
}
