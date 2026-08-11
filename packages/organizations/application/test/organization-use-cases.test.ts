import assert from "node:assert/strict";
import test from "node:test";
import {
  companyId,
  organizationId,
  userId,
  type OrganizationAccess,
  type OrganizationCompany,
} from "@kontave/organizations-domain";
import { ListOrganizationCompanies, type OrganizationDirectory } from "../src/index.js";

const ownerId = userId("user-1");
const ownOrganizationId = organizationId("org-1");
const access: OrganizationAccess = {
  organization: { id: ownOrganizationId, name: "Kontave", slug: "kontave", status: "active" },
  membership: { organizationId: ownOrganizationId, userId: ownerId, role: "owner", status: "active", permissions: ["*"] },
};
const company: OrganizationCompany = { id: companyId("J-1"), organizationId: ownOrganizationId, name: "Empresa", rif: "J-1" };

class FakeDirectory implements OrganizationDirectory {
  async listAccessForUser() { return [access]; }
  async findAccess(_userId: typeof ownerId, target: typeof ownOrganizationId) { return target === ownOrganizationId ? access : null; }
  async listCompanies() { return [company]; }
  async findCompany() { return company; }
}

test("companies are returned only after active organization access is confirmed", async () => {
  const result = await new ListOrganizationCompanies(new FakeDirectory()).execute(ownerId, ownOrganizationId);
  assert.deepEqual(result, [company]);
});

test("foreign organizations are denied before querying their companies", async () => {
  const useCase = new ListOrganizationCompanies(new FakeDirectory());
  await assert.rejects(() => useCase.execute(ownerId, organizationId("org-2")), { code: "ORGANIZATION_ACCESS_DENIED" });
});

test("a repository cannot leak a company from another organization", async () => {
  class LeakingDirectory extends FakeDirectory {
    override async listCompanies() {
      return [{ ...company, organizationId: organizationId("org-2") }];
    }
  }
  const useCase = new ListOrganizationCompanies(new LeakingDirectory());
  await assert.rejects(() => useCase.execute(ownerId, ownOrganizationId), { code: "COMPANY_ACCESS_DENIED" });
});
