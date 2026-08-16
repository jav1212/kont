import { z } from "zod";
import { MembershipStatus, OrganizationStatus } from "@kontave/organizations-domain";
export const membershipRowSchema = z.object({ organization_id: z.uuid(), user_id: z.uuid(), role: z.string().min(1), status: z.enum(MembershipStatus) });
export const organizationRowSchema = z.object({ id: z.uuid(), legacy_tenant_id: z.uuid().nullable(), name: z.string().min(1), slug: z.string().min(1), status: z.enum(OrganizationStatus), avatar_url: z.string().nullable(), version: z.number().int().positive() });
export const organizationPresentationRowSchema = z.object({ id: z.uuid(), avatar_url: z.string().nullable() });
export const organizationOwnerRowSchema = z.object({ organization_id: z.uuid(), user_id: z.uuid() });
export const profilePresentationRowSchema = z.object({ id: z.uuid(), avatar_url: z.string().nullable() });
export const companyRowSchema = z.object({ organization_id: z.uuid(), id: z.string().min(1), name: z.string().min(1), rif: z.string().nullable(), logo_url: z.string().nullable() });
export type MembershipRow = z.infer<typeof membershipRowSchema>; export type OrganizationRow = z.infer<typeof organizationRowSchema>; export type CompanyRow = z.infer<typeof companyRowSchema>;
