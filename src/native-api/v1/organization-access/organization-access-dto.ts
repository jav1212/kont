import type { NativeAccessibleOrganizationDto } from "@kontave/native-api-contracts";
import type { WorkspacePortfolioEntry } from "@kontave/workspace-context-application";

export function toAccessibleOrganizationDto(value: WorkspacePortfolioEntry): NativeAccessibleOrganizationDto {
  return {
    organizationId: value.organizationId,
    name: value.name,
    avatarUrl: value.avatarUrl,
    relationship: value.relationship,
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
