import { Currency, money, type Money } from "@kontave/billing-domain";
import type { OrganizationId } from "@kontave/organizations-domain";

export enum RewardType {
  FixedAmount = "fixed_amount",
  Percentage = "percentage",
}

export enum RewardStatus {
  Pending = "pending",
  Qualified = "qualified",
  Granted = "granted",
  Cancelled = "cancelled",
  Expired = "expired",
}

export enum AttributionStatus {
  Active = "active",
  Qualified = "qualified",
  Cancelled = "cancelled",
}

export interface ReferralPolicy {
  readonly id: string;
  readonly version: number;
  readonly rewardType: RewardType;
  readonly valueBasisPoints: number;
  readonly currency: Currency;
  readonly appliesToFirstPaidInvoice: boolean;
}

export interface ReferralAttribution {
  readonly id: string;
  readonly referrerOrganizationId: OrganizationId;
  readonly referredOrganizationId: OrganizationId;
  readonly code: string;
  readonly status: AttributionStatus;
  readonly attributedAt: string;
}

export interface ReferralReward {
  readonly id: string;
  readonly beneficiaryOrganizationId: OrganizationId;
  readonly referredOrganizationId: OrganizationId;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly rewardType: RewardType;
  readonly configuredValue: number;
  readonly calculatedCredit: Money;
  readonly sourceInvoiceId: string;
  readonly status: RewardStatus;
}

export type ReferralFailureCode =
  | "SELF_REFERRAL"
  | "ALREADY_ATTRIBUTED"
  | "INVALID_REWARD"
  | "REFERRAL_NOT_FOUND"
  | "REPOSITORY_UNAVAILABLE";

export class ReferralFailure extends Error {
  constructor(readonly code: ReferralFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReferralFailure";
  }
}

export function assertDistinctOrganizations(referrer: OrganizationId, referred: OrganizationId): void {
  if (referrer === referred) {
    throw new ReferralFailure("SELF_REFERRAL", "An organization cannot refer itself.");
  }
}

export function calculatePercentageReward(amount: Money, basisPoints: number): Money {
  const hasValidAmount = amount.currency === Currency.Usd && amount.minorAmount > BigInt(0);
  const hasValidRate = Number.isInteger(basisPoints) && basisPoints > 0 && basisPoints <= 10_000;
  if (!hasValidAmount || !hasValidRate) {
    throw new ReferralFailure("INVALID_REWARD", "The referral reward configuration is invalid.");
  }

  const roundedMinorAmount = (amount.minorAmount * BigInt(basisPoints) + BigInt(5_000)) / BigInt(10_000);
  return money(roundedMinorAmount, amount.currency);
}
