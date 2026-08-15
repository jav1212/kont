import assert from "node:assert/strict";
import test from "node:test";
import { OrganizationAccessPathKind } from "@kontave/organization-delegations-domain";
import { OrganizationRelationship, organizationId, userId, type OrganizationRelationship as OrganizationRelationshipValue } from "@kontave/organizations-domain";
import type { WorkspacePortfolioEntry } from "@kontave/workspace-context-application";
import { toAccessibleOrganizationDto } from "../organization-access-dto.js";

const actor = userId("user-1");

function entry(relationship: OrganizationRelationshipValue): WorkspacePortfolioEntry {
  const id = organizationId(relationship);
  return {
    organizationId: id,
    name: relationship,
    avatarUrl: null,
    relationship,
    accessPath: {
      kind: relationship === OrganizationRelationship.Delegated
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
    [OrganizationRelationship.Personal, OrganizationRelationship.Member, OrganizationRelationship.Delegated]
      .map((relationship) => toAccessibleOrganizationDto(entry(relationship)).relationship),
    ["personal", "member", "delegated"],
  );
});
