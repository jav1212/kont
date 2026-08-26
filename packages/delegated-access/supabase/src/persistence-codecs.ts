import { z } from "zod";
import {
  DelegatedAccessScope,
  DelegatedAccessAssignmentStatus,
  DelegatedAccessStatus,
} from "@kontave/delegated-access-domain";

export const delegationStatusSchema = z.enum(DelegatedAccessStatus);
export const delegatedScopeSchema = z.enum(DelegatedAccessScope);
export const assignmentStatusSchema = z.enum(DelegatedAccessAssignmentStatus);

export const delegationRowSchema = z.object({
  id: z.string().min(1),
  provider_organization_id: z.string().min(1),
  client_organization_id: z.string().min(1),
  status: delegationStatusSchema,
  valid_from: z.string(),
  valid_until: z.string().nullable(),
  accepted_at: z.string().nullable(),
  suspended_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  client_organization_name: z.string().optional(),
  scopes: z.array(delegatedScopeSchema).optional(),
  assignment_status: assignmentStatusSchema.optional(),
});
