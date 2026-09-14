import { z } from "zod";

/** Cookie-authenticated Web projection; the tenant ID preserves legacy routing. */
export const workspaceSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  /** Explicit organization branding mirrored for legacy Web consumers; never a personal profile image. */
  avatarUrl: z.string().nullable().optional(),
  /** Explicit organization branding managed from organization settings. */
  logoUrl: z.string().nullable(),
  version: z.number().int().positive(),
  role: z.string().min(1),
  permissions: z.array(z.string()),
  legacyTenantId: z.uuid(),
});
export type OrganizationWorkspace = z.infer<typeof workspaceSchema>;

export const organizationCompanySchema = z.object({
  id: z.string().min(1),
  organizationId: z.uuid(),
  name: z.string().min(1),
  rif: z.string().nullable(),
  logoUrl: z.string().nullable(),
});
export type OrganizationCompany = z.infer<typeof organizationCompanySchema>;

export const organizationMemberSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["membership", "invitation"]),
  organizationId: z.uuid(),
  userId: z.string().nullable(),
  email: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  roleId: z.string(),
  roleName: z.string(),
  status: z.enum(["active", "invited", "suspended"]),
  version: z.number().int().positive(),
  joinedAt: z.string().nullable(),
  invitedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
export type OrganizationMember = z.infer<typeof organizationMemberSchema>;

export const organizationRoleSchema = z.object({
  id: z.string().min(1),
  organizationId: z.uuid().nullable(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(["system", "custom"]),
  permissions: z.array(z.string()),
  status: z.enum(["active", "archived"]),
  version: z.number().int().positive(),
});
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const organizationWorkspaceResponseSchema = z.object({ data: workspaceSchema });
export const organizationWorkspacesResponseSchema = z.object({ data: z.array(workspaceSchema) });
export const organizationCompaniesResponseSchema = z.object({ data: z.array(organizationCompanySchema) });
export const organizationMembersResponseSchema = z.object({ data: z.array(organizationMemberSchema) });
export const organizationRolesResponseSchema = z.object({ data: z.array(organizationRoleSchema) });
export const organizationVersionSchema = z.object({ expectedVersion: z.number().int().positive() });
export const organizationUpdateSchema = organizationVersionSchema.extend({ name: z.string().trim().min(1).max(160) });
