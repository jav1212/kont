import assert from "node:assert/strict";
import test from "node:test";
import { BillingCreditEntryType, Currency, money, type BillingCreditBalance } from "@kontave/billing/domain";
import { organizationId, type OrganizationId } from "@kontave/organizations/domain";
import { AttributionStatus, ReferralFailure, RewardStatus, RewardType, type ReferralAttribution } from "../../src/domain";
import { InMemoryReferralsRepository } from "../../src/testing";
import { AttachReferral, GrantReferralReward, type BillingCreditIssuer, type ReferralsRepository } from "../../src/application";

const referrer = organizationId("00000000-0000-4000-8000-000000000001");
const referred = organizationId("00000000-0000-4000-8000-000000000002");
const policy = {
  id: "00000000-0000-4000-8000-000000000003",
  version: 1,
  rewardType: RewardType.Percentage,
  valueBasisPoints: 2_000,
  currency: Currency.Usd,
  appliesToFirstPaidInvoice: true,
};

class RecordingCreditIssuer implements BillingCreditIssuer {
  readonly issued: Parameters<BillingCreditIssuer["issue"]>[0][] = [];
  async issue(input: Parameters<BillingCreditIssuer["issue"]>[0]) { this.issued.push(input); }
  async getBalance(organization: OrganizationId): Promise<BillingCreditBalance> {
    return { organizationId: organization, balance: money(BigInt(0), Currency.Usd) };
  }
}

test("attaches a normalized referral code to the referred organization", async () => {
  const repository = new InMemoryReferralsRepository(policy, new Map([["KONTAVE20", referrer]]));
  const attribution = await new AttachReferral(repository).execute(referred, "  kontave20 ");
  assert.equal(attribution.code, "KONTAVE20");
  assert.equal(attribution.referrerOrganizationId, referrer);
  assert.equal(repository.attributions.length, 1);
});

test("grants twenty percent only for the first paid invoice and records billing credit", async () => {
  const attribution: ReferralAttribution = {
    id: "00000000-0000-4000-8000-000000000004",
    referrerOrganizationId: referrer,
    referredOrganizationId: referred,
    code: "KONTAVE20",
    status: AttributionStatus.Active,
    attributedAt: "2026-08-11T00:00:00.000Z",
  };
  const repository = new InMemoryReferralsRepository(policy, new Map(), [attribution]);
  const credits = new RecordingCreditIssuer();
  const useCase = new GrantReferralReward(repository, credits);
  const reward = await useCase.execute({
    referredOrganizationId: referred,
    sourceInvoiceId: "invoice-1",
    paidAmount: money(BigInt(10_00), Currency.Usd),
    isFirstPaidInvoice: true,
    occurredAt: "2026-08-11T00:00:00.000Z",
  });

  assert.equal(reward?.status, RewardStatus.Granted);
  assert.equal(reward?.calculatedCredit.minorAmount, BigInt(2_00));
  assert.equal(credits.issued[0]?.type, BillingCreditEntryType.ReferralGrant);
  assert.equal(credits.issued.length, 1);
});

test("reconciles an existing reward through the idempotent billing port", async () => {
  const existing = {
    id: "00000000-0000-4000-8000-000000000005",
    beneficiaryOrganizationId: referrer,
    referredOrganizationId: referred,
    policyId: policy.id,
    policyVersion: policy.version,
    rewardType: RewardType.Percentage,
    configuredValue: policy.valueBasisPoints,
    calculatedCredit: money(BigInt(2_00), Currency.Usd),
    sourceInvoiceId: "invoice-1",
    status: RewardStatus.Granted,
  };
  const repository = new InMemoryReferralsRepository(policy, new Map(), [], [existing]);
  const credits = new RecordingCreditIssuer();
  const result = await new GrantReferralReward(repository, credits).execute({
    referredOrganizationId: referred,
    sourceInvoiceId: "invoice-1",
    paidAmount: money(BigInt(10_00), Currency.Usd),
    isFirstPaidInvoice: true,
    occurredAt: "2026-08-11T00:00:00.000Z",
  });

  assert.equal(result, existing);
  assert.equal(credits.issued.length, 1);
  assert.equal(credits.issued[0]?.idempotencyKey, `referral:${existing.id}`);
});

test("maps unexpected repository failures", async () => {
  const repository = {
    async findOrganizationByCode(): Promise<never> { throw new Error("network unavailable"); },
  } as unknown as ReferralsRepository;
  await assert.rejects(
    () => new AttachReferral(repository).execute(referred, "KONTAVE20"),
    (error: unknown) => error instanceof ReferralFailure && error.code === "REPOSITORY_UNAVAILABLE",
  );
});
