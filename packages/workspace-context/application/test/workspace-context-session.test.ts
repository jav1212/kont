import assert from "node:assert/strict";
import test from "node:test";
import { OrganizationAccessPathKind } from "@kontave/organization-delegations-domain";
import { organizationId, userId, type OrganizationId } from "@kontave/organizations-domain";
import {
  WorkspaceContextSession,
  type ActiveWorkspaceSelectionStore,
  type WorkspacePortfolioEntry,
  type WorkspacePortfolioSource,
} from "../src/index.js";

const actor = userId("user-1");

function workspace(id: string, kind: OrganizationAccessPathKind): WorkspacePortfolioEntry {
  const organization = organizationId(id);
  return {
    organizationId: organization,
    name: id,
    avatarUrl: null,
    accessPath: {
      kind,
      actorUserId: actor,
      actingOrganizationId: organization,
      targetOrganizationId: organization,
      delegationId: null,
      scopes: [],
    },
  };
}

class MemorySelection implements ActiveWorkspaceSelectionStore {
  value: OrganizationId | null;
  constructor(value: OrganizationId | null = null) { this.value = value; }
  async read(): Promise<OrganizationId | null> { return this.value; }
  async write(value: OrganizationId | null): Promise<void> { this.value = value; }
}

test("restore preserves an accessible selection", async () => {
  const delegated = workspace("delegated", OrganizationAccessPathKind.DelegatedOrganization);
  const direct = workspace("direct", OrganizationAccessPathKind.DirectMembership);
  const source: WorkspacePortfolioSource = { async list() { return [direct, delegated]; } };
  const session = new WorkspaceContextSession(source, new MemorySelection(delegated.organizationId));
  assert.equal((await session.restore()).active?.organizationId, delegated.organizationId);
});

test("restore falls back to direct access and selection rejects unavailable workspaces", async () => {
  const delegated = workspace("delegated", OrganizationAccessPathKind.DelegatedOrganization);
  const direct = workspace("direct", OrganizationAccessPathKind.DirectMembership);
  const selection = new MemorySelection(organizationId("missing"));
  const source: WorkspacePortfolioSource = { async list() { return [delegated, direct]; } };
  const session = new WorkspaceContextSession(source, selection);
  assert.equal((await session.restore()).active?.organizationId, direct.organizationId);
  await assert.rejects(() => session.select(organizationId("missing")));
});

test("clear removes both context and persisted selection", async () => {
  const direct = workspace("direct", OrganizationAccessPathKind.DirectMembership);
  const selection = new MemorySelection();
  const source: WorkspacePortfolioSource = { async list() { return [direct]; } };
  const session = new WorkspaceContextSession(source, selection);
  await session.restore();
  assert.equal((await session.clear()).active, null);
  assert.equal(selection.value, null);
});
