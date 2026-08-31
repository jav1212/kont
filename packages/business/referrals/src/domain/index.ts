import { Currency, money, type Money } from "@kontave/billing/domain";
import type { OrganizationId } from "@kontave/organizations/domain";

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

/** Expected failure raised by referral domain and boundary operations. */
export class ReferralFailure extends Error {
  /**
   * @param code - Stable machine-readable failure code.
   * @param message - Safe diagnostic message.
   * @param options - Optional underlying cause.
   */
  constructor(readonly code: ReferralFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReferralFailure";
  }
}

/**
 * Prevents an organization from referring itself.
 * @param referrer - Organization granting the referral.
 * @param referred - Organization receiving the attribution.
 * @returns Nothing when the organizations differ.
 * @throws {ReferralFailure} When both identifiers are equal.
 */
export function assertDistinctOrganizations(referrer: OrganizationId, referred: OrganizationId): void {
  if (referrer === referred) {
    throw new ReferralFailure("SELF_REFERRAL", "An organization cannot refer itself.");
  }
}

/**
 * Calculates a USD referral reward using integer basis points and half-up rounding.
 * @param amount - Positive paid invoice amount in USD.
 * @param basisPoints - Reward rate from 1 through 10,000.
 * @returns The rounded reward amount in USD.
 * @throws {ReferralFailure} When amount, currency or rate is invalid.
 */
export function calculatePercentageReward(amount: Money, basisPoints: number): Money {
  const hasValidAmount = amount.currency === Currency.Usd && amount.minorAmount > BigInt(0);
  const hasValidRate = Number.isInteger(basisPoints) && basisPoints > 0 && basisPoints <= 10_000;
  if (!hasValidAmount || !hasValidRate) {
    throw new ReferralFailure("INVALID_REWARD", "The referral reward configuration is invalid.");
  }

  const roundedMinorAmount = (amount.minorAmount * BigInt(basisPoints) + BigInt(5_000)) / BigInt(10_000);
  return money(roundedMinorAmount, amount.currency);
}
