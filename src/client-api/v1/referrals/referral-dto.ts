import type {
  MoneyDto,
  ReferralAttributionDto,
  ReferralOverviewDto,
  ReferralRewardDto,
} from "@kontave/client-contracts";
import type { Money } from "@kontave/billing-domain";
import type {
  ReferralAttribution,
  ReferralReward,
} from "@kontave/referrals-domain";

export function toReferralAttributionDto(
  value: ReferralAttribution,
): ReferralAttributionDto {
  return {
    id: value.id,
    referrerOrganizationId: value.referrerOrganizationId,
    referredOrganizationId: value.referredOrganizationId,
    code: value.code,
    status: value.status,
    attributedAt: value.attributedAt,
  };
}

export function toReferralOverviewDto(value: {
  code: string;
  referredBy: string | null;
  attributions: number;
  rewards: readonly ReferralReward[];
  balance: { balance: Money };
}): ReferralOverviewDto {
  return {
    code: value.code,
    referredBy: value.referredBy,
    attributions: value.attributions,
    rewards: value.rewards.map(toReferralRewardDto),
    balance: toMoneyDto(value.balance.balance),
  };
}

function toReferralRewardDto(value: ReferralReward): ReferralRewardDto {
  return {
    id: value.id,
    beneficiaryOrganizationId: value.beneficiaryOrganizationId,
    referredOrganizationId: value.referredOrganizationId,
    policyId: value.policyId,
    policyVersion: value.policyVersion,
    rewardType: value.rewardType,
    configuredValue: value.configuredValue,
    calculatedCredit: toMoneyDto(value.calculatedCredit),
    sourceInvoiceId: value.sourceInvoiceId,
    status: value.status,
  };
}

function toMoneyDto(value: Money): MoneyDto {
  return {
    minorAmount: value.minorAmount.toString(),
    currency: value.currency,
  };
}
