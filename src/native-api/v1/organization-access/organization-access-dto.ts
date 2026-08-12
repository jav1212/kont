import type { NativeAccessibleOrganizationDto } from "@kontave/native-api-contracts";
import type { AccessibleOrganization } from "@kontave/organization-delegations-domain";

export function toAccessibleOrganizationDto(value: AccessibleOrganization): NativeAccessibleOrganizationDto {
  return {
    organizationId: value.organizationId,
    name: value.name,
    accessPath: {
      kind: value.accessPath.kind,
      actorUserId: value.accessPath.actorUserId,
      actingOrganizationId: value.accessPath.actingOrganizationId,
      targetOrganizationId: value.accessPath.targetOrganizationId,
      delegationId: value.accessPath.delegationId,
      scopes: value.accessPath.scopes,
    },
  };
}
