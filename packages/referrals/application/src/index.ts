import { BillingCreditEntryType, type BillingCreditBalance, type Money } from "@kontave/billing-domain";
import type { OrganizationId } from "@kontave/organizations-domain";
import {
  AttributionStatus,
  ReferralFailure,
  RewardStatus,
  assertDistinctOrganizations,
  calculatePercentageReward,
  type ReferralAttribution,
  type ReferralPolicy,
  type ReferralReward,
} from "@kontave/referrals-domain";

export interface ReferralOverview {
  readonly code: string;
  readonly referredBy: OrganizationId | null;
  readonly attributions: number;
  readonly rewards: readonly ReferralReward[];
}

export interface ReferralsRepository {
  findOrganizationByCode(code: string): Promise<OrganizationId | null>;
  findAttribution(referred: OrganizationId): Promise<ReferralAttribution | null>;
  attach(input: { referrer: OrganizationId; referred: OrganizationId; code: string }): Promise<ReferralAttribution>;
  getDefaultPolicy(): Promise<ReferralPolicy>;
  findRewardBySource(sourceInvoiceId: string): Promise<ReferralReward | null>;
  saveReward(reward: ReferralReward): Promise<ReferralReward>;
  getOverview(organizationId: OrganizationId): Promise<ReferralOverview>;
}

/** Anti-corruption port: referrals may grant credit but cannot mutate billing invoices. */
export interface BillingCreditIssuer {
  issue(input: {
    organizationId: OrganizationId;
    type: BillingCreditEntryType;
    amount: Money;
    sourceType: "referral_reward";
    sourceId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<void>;
  getBalance(organizationId: OrganizationId): Promise<BillingCreditBalance>;
}

export class AttachReferral {
  constructor(private readonly repository: ReferralsRepository) {}

  async execute(referred: OrganizationId, rawCode: string): Promise<ReferralAttribution> {
    const code = rawCode.trim().toUpperCase();
    const referrer = await this.repository.findOrganizationByCode(code);
    if (!referrer) throw new ReferralFailure("REFERRAL_NOT_FOUND", "The referral code does not exist.");

    assertDistinctOrganizations(referrer, referred);
    if (await this.repository.findAttribution(referred)) {
      throw new ReferralFailure("ALREADY_ATTRIBUTED", "The organization already has a referrer.");
    }

    return this.repository.attach({ referrer, referred, code });
  }
}

export class GrantReferralReward {
  constructor(private readonly repository: ReferralsRepository, private readonly credits: BillingCreditIssuer) {}

  async execute(input: {
    referredOrganizationId: OrganizationId;
    sourceInvoiceId: string;
    paidAmount: Money;
    isFirstPaidInvoice: boolean;
    occurredAt: string;
  }): Promise<ReferralReward | null> {
    if (!input.isFirstPaidInvoice) return null;

    const existing = await this.repository.findRewardBySource(input.sourceInvoiceId);
    if (existing) {
      await this.issueRewardCredit(existing, input.occurredAt);
      return existing;
    }

    const attribution = await this.repository.findAttribution(input.referredOrganizationId);
    if (!attribution || attribution.status !== AttributionStatus.Active) return null;

    const policy = await this.repository.getDefaultPolicy();
    const credit = calculatePercentageReward(input.paidAmount, policy.valueBasisPoints);
    const reward = await this.repository.saveReward({
      id: crypto.randomUUID(),
      beneficiaryOrganizationId: attribution.referrerOrganizationId,
      referredOrganizationId: input.referredOrganizationId,
      policyId: policy.id,
      policyVersion: policy.version,
      rewardType: policy.rewardType,
      configuredValue: policy.valueBasisPoints,
      calculatedCredit: credit,
      sourceInvoiceId: input.sourceInvoiceId,
      status: RewardStatus.Granted,
    });

    await this.issueRewardCredit(reward, input.occurredAt);
    return reward;
  }

  private issueRewardCredit(reward: ReferralReward, occurredAt: string): Promise<void> {
    return this.credits.issue({
      organizationId: reward.beneficiaryOrganizationId,
      type: BillingCreditEntryType.ReferralGrant,
      amount: reward.calculatedCredit,
      sourceType: "referral_reward",
      sourceId: reward.id,
      idempotencyKey: `referral:${reward.id}`,
      occurredAt,
    });
  }
}

export class GetReferralOverview {
  constructor(private readonly repository: ReferralsRepository, private readonly credits: BillingCreditIssuer) {}

  async execute(organizationId: OrganizationId) {
    const [overview, balance] = await Promise.all([
      this.repository.getOverview(organizationId),
      this.credits.getBalance(organizationId),
    ]);
    return { ...overview, balance };
  }
}
