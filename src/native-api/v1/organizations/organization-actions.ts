import { GetOrganization, GetOrganizationCompany, ListOrganizationCompanies, ListOrganizations } from "@kontave/organizations-application";
import { createOrganizationsDirectory } from "@kontave/organizations-supabase";

export function createOrganizationActions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Native organization infrastructure is not configured.");
  const directory = createOrganizationsDirectory({ url, serviceRoleKey });
  return {
    directory,
    listOrganizations: new ListOrganizations(directory),
    getOrganization: new GetOrganization(directory),
    listCompanies: new ListOrganizationCompanies(directory),
    getCompany: new GetOrganizationCompany(directory),
  };
}
