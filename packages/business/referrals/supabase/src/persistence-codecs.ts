import { Currency } from "@kontave/billing-domain";
import { AttributionStatus, RewardStatus, RewardType } from "@kontave/referrals-domain";
import { z } from "zod";

export const referralPolicyRowSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  reward_type: z.enum(RewardType),
  value_basis_points: z.number().int().min(1).max(10_000),
  currency: z.enum(Currency),
  first_paid_invoice_only: z.boolean(),
});

export const referralAttributionRowSchema = z.object({
  id: z.string().uuid(),
  referrer_organization_id: z.string().uuid(),
  referred_organization_id: z.string().uuid(),
  referral_code: z.string().min(1),
  status: z.enum(AttributionStatus),
  attributed_at: z.string().min(1),
});

export const referralRewardRowSchema = z.object({
  id: z.string().uuid(),
  beneficiary_organization_id: z.string().uuid(),
  referred_organization_id: z.string().uuid(),
  policy_id: z.string().uuid(),
  policy_version: z.number().int().positive(),
  reward_type: z.enum(RewardType),
  configured_value: z.number().int().positive(),
  calculated_minor: z.union([z.string(), z.number(), z.bigint()]),
  currency: z.enum(Currency),
  source_invoice_id: z.string().min(1),
  status: z.enum(RewardStatus),
});
