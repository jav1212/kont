import type { MoneyDto } from "../billing";

export interface ReferralAttributionDto {
  readonly id: string;
  readonly referrerOrganizationId: string;
  readonly referredOrganizationId: string;
  readonly code: string;
  readonly status: string;
  readonly attributedAt: string;
}

export interface ReferralRewardDto {
  readonly id: string;
  readonly beneficiaryOrganizationId: string;
  readonly referredOrganizationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly rewardType: string;
  readonly configuredValue: number;
  readonly calculatedCredit: MoneyDto;
  readonly sourceInvoiceId: string;
  readonly status: string;
}

export interface ReferralOverviewDto {
  readonly code: string;
  readonly referredBy: string | null;
  readonly attributions: number;
  readonly rewards: readonly ReferralRewardDto[];
  readonly balance: MoneyDto;
}

