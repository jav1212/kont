import assert from "node:assert/strict";
import test from "node:test";
import type { BillingAccount, OrganizationEntitlements } from "@kontave/billing-domain";
import { organizationId, userId, type OrganizationRole } from "@kontave/organizations-domain";
import { GetBillingOverview, ListBillingPaymentMethods, type OrganizationBillingAccess, type OrganizationBillingRepository } from "../src/index.js";

const orgId = organizationId("org-1");
const actorId = userId("user-1");
const account: BillingAccount = { id: "account-1", organizationId: orgId, legalName: "Kontave", taxId: null, billingEmail: null, countryCode: "VE", currency: "USD" };
const entitlements: OrganizationEntitlements = { maxCompanies: 1, maxMembers: null, maxDevices: null, enabledModules: ["payroll"] };
class Access implements OrganizationBillingAccess {
  constructor(private readonly role: OrganizationRole | null) {}
  async findActiveRole() { return this.role; }
}
class Repository implements OrganizationBillingRepository {
  async findAccount() { return account; }
  async listSubscriptions() { return []; }
  async getEntitlements() { return entitlements; }
  async getUsage() { return { companies: { used: 0, maximum: 1, remaining: 1 }, members: { used: 1, maximum: null, remaining: null }, devices: { used: 0, maximum: null, remaining: null } }; }
  async listInvoices() { return []; }
  async listPaymentMethods() { return []; }
}
test("an active member can read the organization billing overview", async () => {
  const result = await new GetBillingOverview(new Repository(), new Access("seller")).execute(actorId, orgId);
  assert.equal(result.account.id, "account-1");
});
test("only owners and admins can inspect payment methods", async () => {
  await assert.rejects(
    () => new ListBillingPaymentMethods(new Repository(), new Access("accountant")).execute(actorId, orgId),
    { code: "BILLING_ACCESS_DENIED" },
  );
});
