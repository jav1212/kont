import { z } from "zod";
import {
  DelegatedScope,
  DelegationAssignmentStatus,
  OrganizationDelegationStatus,
} from "@kontave/organization-delegations-domain";

export const delegationStatusSchema = z.enum(OrganizationDelegationStatus);
export const delegatedScopeSchema = z.enum(DelegatedScope);
export const assignmentStatusSchema = z.enum(DelegationAssignmentStatus);

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
