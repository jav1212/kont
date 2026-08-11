import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BillingCreditEntryType, Currency, money, type BillingCreditBalance } from "@kontave/billing-domain";
import { organizationId, type OrganizationId } from "@kontave/organizations-domain";
import type { BillingCreditIssuer, ReferralsRepository } from "@kontave/referrals-application";
import type { ReferralAttribution, ReferralPolicy, ReferralReward } from "@kontave/referrals-domain";
import { referralAttributionRowSchema, referralPolicyRowSchema, referralRewardRowSchema } from "./persistence-codecs";

export interface ReferralsSupabaseConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

export function createReferralsInfrastructure(configuration: ReferralsSupabaseConfiguration) {
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    repository: new SupabaseReferralsRepository(client),
    credits: new SupabaseBillingCreditIssuer(client),
  };
}

export class SupabaseReferralsRepository implements ReferralsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findOrganizationByCode(code: string): Promise<OrganizationId | null> {
    const { data, error } = await this.client
      .from("organization_referral_accounts")
      .select("organization_id")
      .eq("code", code)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    return data ? organizationId(data.organization_id) : null;
  }

  async findAttribution(referred: OrganizationId): Promise<ReferralAttribution | null> {
    const { data, error } = await this.client
      .from("organization_referral_attributions")
      .select("*")
      .eq("referred_organization_id", referred)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAttribution(data) : null;
  }

  async attach(input: { referrer: OrganizationId; referred: OrganizationId; code: string }) {
    const { data, error } = await this.client
      .from("organization_referral_attributions")
      .insert({
        referrer_organization_id: input.referrer,
        referred_organization_id: input.referred,
        referral_code: input.code,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapAttribution(data);
  }

  async getDefaultPolicy(): Promise<ReferralPolicy> {
    const { data, error } = await this.client
      .from("referral_policies")
      .select("*")
      .eq("status", "active")
      .order("version", { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    const row = referralPolicyRowSchema.parse(data);
    return {
      id: row.id,
      version: row.version,
      rewardType: row.reward_type,
      valueBasisPoints: row.value_basis_points,
      currency: row.currency,
      appliesToFirstPaidInvoice: row.first_paid_invoice_only,
    };
  }

  async findRewardBySource(sourceInvoiceId: string): Promise<ReferralReward | null> {
    const { data, error } = await this.client
      .from("organization_referral_rewards")
      .select("*")
      .eq("source_invoice_id", sourceInvoiceId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapReward(data) : null;
  }

  async saveReward(reward: ReferralReward): Promise<ReferralReward> {
    const { data, error } = await this.client
      .from("organization_referral_rewards")
      .insert({
        id: reward.id,
        beneficiary_organization_id: reward.beneficiaryOrganizationId,
        referred_organization_id: reward.referredOrganizationId,
        policy_id: reward.policyId,
        policy_version: reward.policyVersion,
        reward_type: reward.rewardType,
        configured_value: reward.configuredValue,
        calculated_minor: reward.calculatedCredit.minorAmount.toString(),
        currency: reward.calculatedCredit.currency,
        source_invoice_id: reward.sourceInvoiceId,
        status: reward.status,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapReward(data);
  }

  async getOverview(id: OrganizationId) {
    const ensuredAccount = await this.client.rpc("ensure_organization_referral_account", {
      p_organization_id: id,
    });
    if (ensuredAccount.error) throw ensuredAccount.error;

    const [accountResult, attributionsResult, rewardsResult] = await Promise.all([
      this.client.from("organization_referral_accounts").select("code").eq("organization_id", id).single(),
      this.client.from("organization_referral_attributions").select("id").eq("referrer_organization_id", id),
      this.client.from("organization_referral_rewards").select("*").eq("beneficiary_organization_id", id),
    ]);
    const error = accountResult.error ?? attributionsResult.error ?? rewardsResult.error;
    if (error) throw error;
    if (!accountResult.data) throw new Error("Referral account was not provisioned.");

    const referredByResult = await this.client
      .from("organization_referral_attributions")
      .select("referrer_organization_id")
      .eq("referred_organization_id", id)
      .maybeSingle();
    if (referredByResult.error) throw referredByResult.error;

    return {
      code: accountResult.data.code,
      referredBy: referredByResult.data ? organizationId(referredByResult.data.referrer_organization_id) : null,
      attributions: attributionsResult.data?.length ?? 0,
      rewards: (rewardsResult.data ?? []).map(mapReward),
    };
  }
}

export class SupabaseBillingCreditIssuer implements BillingCreditIssuer {
  constructor(private readonly client: SupabaseClient) {}

  async issue(input: {
    organizationId: OrganizationId;
    type: BillingCreditEntryType;
    amount: { minorAmount: bigint; currency: Currency };
    sourceType: "referral_reward";
    sourceId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<void> {
    const { error } = await this.client.rpc("issue_organization_billing_credit", {
      p_organization_id: input.organizationId,
      p_entry_type: input.type,
      p_amount_minor: input.amount.minorAmount.toString(),
      p_currency: input.amount.currency,
      p_source_type: input.sourceType,
      p_source_id: input.sourceId,
      p_idempotency_key: input.idempotencyKey,
      p_occurred_at: input.occurredAt,
    });
    if (error) throw error;
  }

  async getBalance(id: OrganizationId): Promise<BillingCreditBalance> {
    const { data, error } = await this.client.rpc("organization_billing_credit_balance", {
      p_organization_id: id,
      p_currency: Currency.Usd,
    });
    if (error) throw error;
    return { organizationId: id, balance: money(BigInt(data ?? 0), Currency.Usd) };
  }
}

function mapAttribution(value: unknown): ReferralAttribution {
  const row = referralAttributionRowSchema.parse(value);
  return {
    id: row.id,
    referrerOrganizationId: organizationId(row.referrer_organization_id),
    referredOrganizationId: organizationId(row.referred_organization_id),
    code: row.referral_code,
    status: row.status,
    attributedAt: row.attributed_at,
  };
}

function mapReward(value: unknown): ReferralReward {
  const row = referralRewardRowSchema.parse(value);
  return {
    id: row.id,
    beneficiaryOrganizationId: organizationId(row.beneficiary_organization_id),
    referredOrganizationId: organizationId(row.referred_organization_id),
    policyId: row.policy_id,
    policyVersion: row.policy_version,
    rewardType: row.reward_type,
    configuredValue: row.configured_value,
    calculatedCredit: money(BigInt(row.calculated_minor), row.currency),
    sourceInvoiceId: row.source_invoice_id,
    status: row.status,
  };
}
