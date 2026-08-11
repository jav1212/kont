-- Cover referral reward foreign keys used by organization and policy queries.
-- Additive only: no existing rows or legacy objects are modified.
create index organization_referral_rewards_beneficiary_idx
  on public.organization_referral_rewards(beneficiary_organization_id);

create index organization_referral_rewards_policy_idx
  on public.organization_referral_rewards(policy_id);
