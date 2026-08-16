import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDenied, AuthorizationReason, AuthorizationSource, PERMISSIONS, type PermissionCode } from "@kontave/access-control-domain";
import { BillingFailure, Currency, money, type BillingAccount, type OrganizationEntitlements } from "@kontave/billing-domain";
import { organizationId, userId } from "@kontave/organizations-domain";
import { ApplyBillingCredit, GetBillingOverview, ListBillingPaymentMethods, type BillingAuthorizationContext, type BillingCreditLedgerRepository, type OrganizationBillingAuthorization, type OrganizationBillingRepository } from "../src/index.js";
const orgId = organizationId("org-1"); const actorId = userId("user-1");
const context: BillingAuthorizationContext = { requestId: "request-1", source: AuthorizationSource.Desktop, occurredAt: new Date(0).toISOString() };
const account: BillingAccount = { id: "account-1", organizationId: orgId, legalName: "Kontave", taxId: null, billingEmail: null, countryCode: "VE", currency: Currency.Usd };
const entitlements: OrganizationEntitlements = { maxCompanies: 1, maxMembers: null, maxDevices: null, enabledModules: ["payroll"] };
class Authorization implements OrganizationBillingAuthorization { constructor(private readonly allowed: readonly string[]) {} async require(input: { permission: PermissionCode }) { if (!this.allowed.includes(input.permission)) throw new AuthorizationDenied({ allowed: false, reason: AuthorizationReason.PermissionMissing }); } }
class Repository implements OrganizationBillingRepository { async findAccount() { return account; } async listSubscriptions() { return []; } async getEntitlements() { return entitlements; } async getUsage() { return { companies: { used: 0, maximum: 1, remaining: 1 }, members: { used: 1, maximum: null, remaining: null }, devices: { used: 0, maximum: null, remaining: null } }; } async listInvoices() { return []; } async listPaymentMethods() { return []; } async listPlans(){return [];} async listManualPaymentRequests(){return [];} async createManualPaymentRequest():Promise<never>{throw new Error("not used");} }
test("billing overview requests a capability instead of interpreting a role", async () => { const result = await new GetBillingOverview(new Repository(), new Authorization([PERMISSIONS.BILLING_READ])).execute(actorId, orgId, context); assert.equal(result.account.id, "account-1"); });
test("payment methods require their explicit permission", async () => { await assert.rejects(() => new ListBillingPaymentMethods(new Repository(), new Authorization([PERMISSIONS.BILLING_READ])).execute(actorId, orgId, context), AuthorizationDenied); });
test("credit applications reject zero before reaching persistence", () => {
  let called=false;
  const ledger = { async getBalance(){return{organizationId:orgId,balance:money(BigInt(0),Currency.Usd)}},async issue(){},async apply(){called=true;throw new Error("unreachable")} } satisfies BillingCreditLedgerRepository;
  assert.throws(() => new ApplyBillingCredit(ledger).execute({organizationId:orgId,invoiceId:"invoice-1",amount:money(BigInt(0),Currency.Usd),idempotencyKey:"apply-0001",occurredAt:context.occurredAt}), BillingFailure);
  assert.equal(called,false);
});
