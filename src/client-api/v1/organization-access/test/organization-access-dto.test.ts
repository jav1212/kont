import assert from "node:assert/strict";
import test from "node:test";
import { OrganizationAccessPathKind } from "@kontave/delegated-access-domain";
import {
  organizationId,
  userId,
} from "@kontave/organizations-domain";
import {
  WorkspaceRelationship,
  type WorkspacePortfolioEntry,
  type WorkspaceRelationship as WorkspaceRelationshipValue,
} from "@kontave/workspace-context-application";
import { toAccessibleOrganizationDto } from "../organization-access-dto";

const actor = userId("user-1");

function entry(
  relationship: WorkspaceRelationshipValue,
): WorkspacePortfolioEntry {
  const id = organizationId(relationship);
  return {
    organizationId: id,
    name: relationship,
    avatarUrl: null,
    relationship,
    accessPath: {
      kind:
        relationship === WorkspaceRelationship.Delegated
          ? OrganizationAccessPathKind.DelegatedOrganization
          : OrganizationAccessPathKind.DirectMembership,
      actorUserId: actor,
      actingOrganizationId: id,
      targetOrganizationId: id,
      delegationId: null,
      scopes: [],
    },
  };
}

test("native organization access DTO preserves every explicit relationship", () => {
  assert.deepEqual(
    [
      WorkspaceRelationship.Personal,
      WorkspaceRelationship.Member,
      WorkspaceRelationship.Delegated,
    ].map(
      (relationship) =>
        toAccessibleOrganizationDto(entry(relationship)).relationship,
    ),
    ["personal", "member", "delegated"],
  );
});
