import assert from "node:assert/strict";
import test from "node:test";
import {
  AcceptOrganizationDelegation,
  AssignDelegationMember,
  CreateOrganizationDelegation,
} from "@kontave/organization-delegations-application";
import { ListWorkspacePortfolio, ResolveWorkspaceAccessPath } from "@kontave/workspace-context-application";
import { DelegatedScope, OrganizationAccessPathKind } from "@kontave/organization-delegations-domain";
import { organizationId, userId } from "@kontave/organizations-domain";
import { InMemoryOrganizationDelegationRepository } from "../src/index";

class DirectDirectory {
  async listForUser() { return [{ organizationId: organizationId("provider"), name: "Oficina KM11" }]; }
  async findForUser(_user: unknown, id: ReturnType<typeof organizationId>) {
    return id === organizationId("provider") ? { organizationId: id, name: "Oficina KM11" } : null;
  }
}

class PresentationDirectory {
  async listByOrganizationIds(ids: readonly ReturnType<typeof organizationId>[]) {
    return ids.map((id) => ({
      organizationId: id,
      avatarUrl: id === organizationId("client") ? "https://cdn.example.com/client.png" : null,
    }));
  }
}

test("builds an explicit one-hop delegated access path", async () => {
  const repository = new InMemoryOrganizationDelegationRepository();
  repository.names.set(organizationId("client"), "Cliente CA");
  const actor = userId("accountant");
  const delegation = await new CreateOrganizationDelegation(repository).execute({
    providerOrganizationId: organizationId("provider"),
    clientOrganizationId: organizationId("client"),
    scopes: [DelegatedScope.Accounting],
    validFrom: "2026-08-01T00:00:00.000Z",
    validUntil: null,
    requestedBy: actor,
  });
  await new AcceptOrganizationDelegation(repository).execute(delegation.id, actor, "2026-08-02T00:00:00.000Z");
  await new AssignDelegationMember(repository).execute(delegation.id, actor, actor, "2026-08-02T00:00:00.000Z");

  const directory = new DirectDirectory();
  const portfolio = await new ListWorkspacePortfolio(directory, repository, new PresentationDirectory())
    .execute(actor, "2026-08-03T00:00:00.000Z");
  assert.equal(portfolio.length, 2);
  assert.equal(portfolio.find((item) => item.organizationId === organizationId("client"))?.avatarUrl, "https://cdn.example.com/client.png");
  assert.equal(portfolio.find((item) => item.organizationId === organizationId("provider"))?.avatarUrl, null);
  const path = await new ResolveWorkspaceAccessPath(directory, repository).execute({
    userId: actor,
    actingOrganizationId: organizationId("provider"),
    targetOrganizationId: organizationId("client"),
    occurredAt: "2026-08-03T00:00:00.000Z",
  });
  assert.equal(path.kind, OrganizationAccessPathKind.DelegatedOrganization);
  assert.deepEqual(path.scopes, [DelegatedScope.Accounting]);
});
