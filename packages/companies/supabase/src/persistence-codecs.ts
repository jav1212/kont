import { z } from "zod";
import { CompanyCountry, CompanyStatus } from "@kontave/companies-domain";

export const companyRowSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  legacy_company_id: z.string().nullable(),
  legal_name: z.string().min(1),
  trade_name: z.string().nullable(),
  tax_id: z.string().nullable(),
  country_code: z.enum(CompanyCountry),
  status: z.enum(CompanyStatus),
});
