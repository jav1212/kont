import { z } from "zod";

/** Strict post-migration row returned by administrative RPC functions. */
export const companyRowSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  name: z.string().min(1),
  rif: z.string().nullable(),
  trade_name: z.string().nullable(),
  country: z.literal("VE"),
  status: z.enum(["active", "suspended", "archived"]),
  operating_profile: z.enum(["standard", "kiosk"]).catch("standard"),
  person_nature: z.enum(["natural", "juridical"]).nullable().optional().default(null),
  version: z.number().int().positive(),
  logo_url: z.string().url().startsWith("https://").nullable().optional().default(null),
});

/** Legacy shared_companies row accepted only when every administration column is absent. */
export const legacyCompanyRowSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  name: z.string().min(1),
  rif: z.string().nullable(),
  operating_profile: z.enum(["standard", "kiosk"]).catch("standard"),
  logo_url: z.string().url().startsWith("https://").nullable().optional(),
  person_nature: z.enum(["natural", "juridical"]).nullable().optional().default(null),
}).passthrough();

export type CompanyRow = z.infer<typeof companyRowSchema>;

/** Strict row returned by the company monetary-policy service RPCs. */
export const companyMonetaryPolicyRowSchema = z.object({
  organization_id: z.string().min(1),
  company_id: z.string().min(1),
  policy_version: z.number().int().positive(),
  operating_currency_code: z.literal("VES"),
  operating_currency_minor_unit: z.literal(2),
  reference_currency_codes: z.array(z.enum(["USD", "EUR"])).min(1),
  rate_source: z.literal("bcv"),
  rounding_profile: z.literal("commercial_v1"),
  allow_previous_available_date: z.literal(false),
  max_previous_days: z.literal(0),
  configured_at: z.string().datetime({ offset: true }),
  configured_by: z.string().min(1),
});

/** Type inferred from the only supported monetary policy persistence representation. */
export type CompanyMonetaryPolicyRow = z.infer<typeof companyMonetaryPolicyRowSchema>;

/** Strict row returned by the company date-format service RPCs. */
export const companyDateFormatRowSchema = z.object({
  organization_id: z.string().min(1),
  company_id: z.string().min(1),
  format_version: z.number().int().positive(),
  date_order: z.enum(["day_first", "year_first", "month_first"]),
  configured_at: z.string().datetime({ offset: true }),
  configured_by: z.string().min(1),
});

/** Type inferred from the only supported company date-format persistence representation. */
export type CompanyDateFormatRow = z.infer<typeof companyDateFormatRowSchema>;

/** Strict camel-case payload returned by the ADM-025 fiscal-profile RPCs. */
export const companyFiscalProfileSchema = z.object({
  companyId: z.string().min(1),
  legalName: z.string().min(1).max(255),
  // Existing companies may retain noncanonical RIF formatting until their dedicated cleanup case.
  taxId: z.string().min(1).max(128).nullable(),
  personNature: z.enum(["natural", "juridical"]).nullable(),
  fiscalAddress: z.string().min(1).max(500).nullable(),
  taxpayerType: z.enum(["ordinario", "especial"]),
  companyVersion: z.number().int().positive(),
});

/** Type inferred from the fiscal-profile RPC payload. */
export type CompanyFiscalProfileRow = z.infer<typeof companyFiscalProfileSchema>;

/** Strict response returned only by atomic company configuration-copy RPCs. */
export const companyConfigurationCopyResultSchema = z.object({
  company: companyRowSchema,
  copied_sections: z.array(z.enum(["operating_profile", "date_format", "monetary_policy", "fiscal_profile"])).min(1),
});
