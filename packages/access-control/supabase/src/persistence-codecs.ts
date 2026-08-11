import { z } from "zod";
import { RoleKind, RoleStatus } from "@kontave/access-control-domain";
import { MembershipStatus, OrganizationStatus } from "@kontave/organizations-domain";

const permissionRelation = z.object({ permission_code: z.string().min(1) });
export const roleRowSchema = z.object({
  id: z.uuid(), organization_id: z.uuid().nullable(), code: z.string().min(1),
  name: z.string().min(1), description: z.string(), kind: z.enum(RoleKind),
  status: z.enum(RoleStatus), version: z.number().int().positive(),
  organization_role_permissions: z.array(permissionRelation),
});
const organizationRelation = z.union([z.object({ status: z.enum(OrganizationStatus) }), z.array(z.object({ status: z.enum(OrganizationStatus) })).length(1)]).transform((value) => Array.isArray(value) ? value[0]! : value);
const roleRelation = z.union([roleRowSchema, z.array(roleRowSchema).length(1)]).transform((value) => Array.isArray(value) ? value[0]! : value);
export const authorizationSnapshotRowSchema = z.object({
  id: z.uuid(), status: z.enum(MembershipStatus), authorization_version: z.number().int().positive(),
  organization_id: z.uuid(), organizations: organizationRelation, organization_roles: roleRelation,
});
export type RoleRow = z.infer<typeof roleRowSchema>;
export type AuthorizationSnapshotRow = z.infer<typeof authorizationSnapshotRowSchema>;
