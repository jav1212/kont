import type { OrganizationId } from "@kontave/organizations-domain";
import { AttributionStatus, type ReferralAttribution, type ReferralPolicy, type ReferralReward } from "@kontave/referrals-domain";

export class InMemoryReferralsRepository {
  constructor(
    readonly policy: ReferralPolicy,
    readonly codes = new Map<string, OrganizationId>(),
    readonly attributions: ReferralAttribution[] = [],
    readonly rewards: ReferralReward[] = [],
  ) {}

  async findOrganizationByCode(code: string) {
    return this.codes.get(code) ?? null;
  }

  async findAttribution(id: OrganizationId) {
    return this.attributions.find((attribution) => attribution.referredOrganizationId === id) ?? null;
  }

  async attach(input: { referrer: OrganizationId; referred: OrganizationId; code: string }) {
    const attribution: ReferralAttribution = {
      id: crypto.randomUUID(),
      referrerOrganizationId: input.referrer,
      referredOrganizationId: input.referred,
      code: input.code,
      status: AttributionStatus.Active,
      attributedAt: new Date(0).toISOString(),
    };
    this.attributions.push(attribution);
    return attribution;
  }

  async getDefaultPolicy() {
    return this.policy;
  }

  async findRewardBySource(id: string) {
    return this.rewards.find((reward) => reward.sourceInvoiceId === id) ?? null;
  }

  async saveReward(reward: ReferralReward) {
    this.rewards.push(reward);
    return reward;
  }

  async getOverview(organizationId: OrganizationId) {
    return {
      code: "TESTCODE",
      referredBy: (await this.findAttribution(organizationId))?.referrerOrganizationId ?? null,
      attributions: this.attributions.filter((item) => item.referrerOrganizationId === organizationId).length,
      rewards: this.rewards.filter((item) => item.beneficiaryOrganizationId === organizationId),
    };
  }
}
