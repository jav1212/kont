import { DeleteOrganizationLogo, GetOrganization, GetOrganizationCompany, ListOrganizationCompanies, ListOrganizations, UpdateOrganization, UploadOrganizationLogo } from "@kontave/organizations-application";
import { SupabaseOrganizationLogoStorage, createOrganizationsDirectory } from "@kontave/organizations-supabase";

export function createOrganizationActions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Native organization infrastructure is not configured.");
  const directory = createOrganizationsDirectory({ url, serviceRoleKey });
  const logos = new SupabaseOrganizationLogoStorage({ url, serviceRoleKey });
  return {
    directory,
    listOrganizations: new ListOrganizations(directory),
    getOrganization: new GetOrganization(directory),
    listCompanies: new ListOrganizationCompanies(directory),
    getCompany: new GetOrganizationCompany(directory),
    updateOrganization: new UpdateOrganization(directory),
    uploadLogo: new UploadOrganizationLogo(directory, logos),
    deleteLogo: new DeleteOrganizationLogo(directory, logos),
  };
}
