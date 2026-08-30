import {
  BillingCreditEntryType,
  type BillingCreditBalance,
  type Money,
} from "@kontave/billing-domain";
import type { OrganizationId } from "@kontave/organizations/domain";
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

/** Referral account summary owned by an organization. */
export interface ReferralOverview {
  readonly code: string;
  readonly referredBy: OrganizationId | null;
  readonly attributions: number;
  readonly rewards: readonly ReferralReward[];
}

/** Persistence port owned by the referrals application layer. */
export interface ReferralsRepository {
  /** @returns The organization owning a referral code, or `null` when absent. */
  findOrganizationByCode(code: string): Promise<OrganizationId | null>;
  /** @returns Attribution for a referred organization, or `null` when absent. */
  findAttribution(referred: OrganizationId): Promise<ReferralAttribution | null>;
  /** @returns The authoritative referral attribution created by persistence. */
  attach(input: {
    referrer: OrganizationId;
    referred: OrganizationId;
    code: string;
  }): Promise<ReferralAttribution>;
  /** @returns The active default referral reward policy. */
  getDefaultPolicy(): Promise<ReferralPolicy>;
  /** @returns The reward for an invoice, or `null` when none has been generated. */
  findRewardBySource(sourceInvoiceId: string): Promise<ReferralReward | null>;
  /** @returns The authoritative reward saved by persistence. */
  saveReward(reward: ReferralReward): Promise<ReferralReward>;
  /** @returns Referral account summary for the organization. */
  getOverview(organizationId: OrganizationId): Promise<ReferralOverview>;
}

/** Anti-corruption port allowing referrals to grant credit without mutating invoices. */
export interface BillingCreditIssuer {
  /** @returns A promise completed after issuing an idempotent referral credit. */
  issue(input: {
    organizationId: OrganizationId;
    type: BillingCreditEntryType;
    amount: Money;
    sourceType: "referral_reward";
    sourceId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<void>;
  /** @returns The current billing-credit balance for an organization. */
  getBalance(organizationId: OrganizationId): Promise<BillingCreditBalance>;
}

/** Attaches a valid external referral code to an unattributed organization. */
export class AttachReferral {
  /** @param repository - Referrals persistence port. */
  constructor(private readonly repository: ReferralsRepository) {}

  /**
   * @param referred - Organization receiving the attribution.
   * @param rawCode - User-provided referral code.
   * @returns The created attribution.
   * @throws {ReferralFailure} When absent, self-referred, already attributed or persistence fails.
   */
  execute(referred: OrganizationId, rawCode: string): Promise<ReferralAttribution> {
    const code = rawCode.trim().toUpperCase();
    return referralCall(async () => {
      const referrer = await this.repository.findOrganizationByCode(code);
      if (!referrer) {
        throw new ReferralFailure("REFERRAL_NOT_FOUND", "The referral code does not exist.");
      }
      assertDistinctOrganizations(referrer, referred);
      if (await this.repository.findAttribution(referred)) {
        throw new ReferralFailure("ALREADY_ATTRIBUTED", "The organization already has a referrer.");
      }
      return this.repository.attach({ referrer, referred, code });
    });
  }
}

/** Grants the idempotent reward associated with a referred organization's first paid invoice. */
export class GrantReferralReward {
  /**
   * @param repository - Referrals persistence port.
   * @param credits - Billing-credit anti-corruption port.
   */
  constructor(
    private readonly repository: ReferralsRepository,
    private readonly credits: BillingCreditIssuer,
  ) {}

  /**
   * @param input - Referred organization, invoice, paid amount and occurrence data.
   * @returns The existing or created reward, or `null` when the invoice does not qualify.
   * @throws {ReferralFailure} When reward calculation or a boundary fails.
   */
  execute(input: {
    referredOrganizationId: OrganizationId;
    sourceInvoiceId: string;
    paidAmount: Money;
    isFirstPaidInvoice: boolean;
    occurredAt: string;
  }): Promise<ReferralReward | null> {
    if (!input.isFirstPaidInvoice) return Promise.resolve(null);
    return referralCall(async () => {
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
    });
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

/** Referral overview enriched with the beneficiary's billing-credit balance. */
export interface ReferralOverviewWithBalance extends ReferralOverview {
  readonly balance: BillingCreditBalance;
}

/** Loads referral account activity together with the current credit balance. */
export class GetReferralOverview {
  /**
   * @param repository - Referrals persistence port.
   * @param credits - Billing-credit anti-corruption port.
   */
  constructor(
    private readonly repository: ReferralsRepository,
    private readonly credits: BillingCreditIssuer,
  ) {}

  /**
   * @param organizationId - Organization whose referral account is requested.
   * @returns Referral summary and current billing-credit balance.
   * @throws {ReferralFailure} When either boundary fails.
   */
  execute(organizationId: OrganizationId): Promise<ReferralOverviewWithBalance> {
    return referralCall(async () => {
      const [overview, balance] = await Promise.all([
        this.repository.getOverview(organizationId),
        this.credits.getBalance(organizationId),
      ]);
      return { ...overview, balance };
    });
  }
}

async function referralCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof ReferralFailure) throw cause;
    throw new ReferralFailure("REPOSITORY_UNAVAILABLE", "Referral persistence is unavailable.", { cause });
  }
}
